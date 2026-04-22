/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/require-auth', () => ({
  requireAuth: jest.fn(),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(msg: string, status = 401) { super(msg); this.status = status; }
  },
}));

const mockSesSend = jest.fn();
const mockDynamoSend = jest.fn();

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  ListIdentitiesCommand: jest.fn((p: unknown) => p),
  CreateEmailIdentityCommand: jest.fn((p: unknown) => p),
  CreateReceiptRuleCommand: jest.fn((p: unknown) => p),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockDynamoSend })) },
  ScanCommand: jest.fn((p: unknown) => p),
  PutCommand: jest.fn((p: unknown) => p),
  GetCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.ADDRESSES_TABLE = 'hermes-addresses';
process.env.S3_BUCKET = 'hermes-email-store';
process.env.SES_RULE_SET_NAME = 'hermes-receipt-rules';
process.env.INBOUND_PROCESSOR_ARN = 'arn:aws:lambda:us-west-2:123456789012:function:hermes-inbound-email-processor';

import { GET, POST } from '@/app/api/addresses/route';

const mockRequireAuth = requireAuth as jest.Mock;

function makeGetReq() {
  return new NextRequest('http://localhost/api/addresses');
}

function makePostReq(body: unknown) {
  return new NextRequest('http://localhost/api/addresses', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/addresses ──────────────────────────────────────────────────────

describe('GET /api/addresses', () => {
  test('returns active addresses for authenticated request', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Items: [{ email: 'hello@example.com', domain: 'example.com', status: 'active' }],
    });

    const res = await GET(makeGetReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.addresses).toHaveLength(1);
    expect(body.addresses[0].email).toBe('hello@example.com');
  });

  test('returns empty list when no addresses exist', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [] });

    const res = await GET(makeGetReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ addresses: [] });
  });

  test('filters out soft-deleted addresses via FilterExpression', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [] });

    await GET(makeGetReq());

    const scanArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(scanArg).toMatchObject({
      FilterExpression: expect.stringContaining('<>'),
      ExpressionAttributeValues: expect.objectContaining({ ':deleted': 'deleted' }),
    });
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });
});

// ── POST /api/addresses ─────────────────────────────────────────────────────

describe('POST /api/addresses', () => {
  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    // First SES call: ListIdentities (domain check)
    // Subsequent SES calls: CreateEmailIdentity, CreateReceiptRule
    mockSesSend.mockImplementation((cmd: Record<string, unknown>) => {
      if ('IdentityType' in cmd) return Promise.resolve({ Identities: ['example.com'] });
      return Promise.resolve({});
    });
    // First DynamoDB call: GetCommand (duplicate check) — not found
    // Second DynamoDB call: PutCommand
    mockDynamoSend.mockImplementation((cmd: Record<string, unknown>) => {
      if ('Key' in cmd) return Promise.resolve({ Item: undefined });
      return Promise.resolve({});
    });
  });

  test('creates address and returns 201 for valid request', async () => {
    const res = await POST(makePostReq({ email: 'hello@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.address.email).toBe('hello@example.com');
    expect(body.address.domain).toBe('example.com');
    expect(body.address.status).toBe('active');
  });

  test('writes address record to DynamoDB', async () => {
    await POST(makePostReq({ email: 'hello@example.com' }));

    const putArg = (mockDynamoSend.mock.calls as Array<[Record<string, unknown>]>).find(
      ([cmd]) => 'Item' in cmd,
    )?.[0];
    expect(putArg).toMatchObject({
      TableName: 'hermes-addresses',
      Item: expect.objectContaining({ email: 'hello@example.com', status: 'active' }),
    });
  });

  test('creates SES receipt rule routing to correct S3 prefix and Lambda', async () => {
    await POST(makePostReq({ email: 'hello@example.com' }));

    const ruleCmd = mockSesSend.mock.calls.find(
      ([cmd]: [Record<string, unknown>]) => 'RuleSetName' in cmd,
    )?.[0] as Record<string, unknown>;
    expect(ruleCmd).toBeDefined();

    const rule = (ruleCmd as any).Rule;
    expect(rule.Recipients).toContain('hello@example.com');
    expect(rule.Actions[0].S3Action.ObjectKeyPrefix).toBe('inbound/hello@example.com/');
    expect(rule.Actions[1].LambdaAction.FunctionArn).toBe(process.env.INBOUND_PROCESSOR_ARN);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await POST(makePostReq({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  test('returns 400 when domain is not verified in SES', async () => {
    mockSesSend.mockResolvedValueOnce({ Identities: [] });

    const res = await POST(makePostReq({ email: 'hello@unverified.com' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not verified');
  });

  test('returns 409 when address already exists and is active', async () => {
    mockDynamoSend.mockImplementation((cmd: Record<string, unknown>) => {
      if ('Key' in cmd) return Promise.resolve({ Item: { email: 'hello@example.com', status: 'active' } });
      return Promise.resolve({});
    });

    const res = await POST(makePostReq({ email: 'hello@example.com' }));
    expect(res.status).toBe(409);
  });

  test('allows re-creating a soft-deleted address', async () => {
    mockDynamoSend.mockImplementation((cmd: Record<string, unknown>) => {
      if ('Key' in cmd) return Promise.resolve({ Item: { email: 'hello@example.com', status: 'deleted' } });
      return Promise.resolve({});
    });

    const res = await POST(makePostReq({ email: 'hello@example.com' }));
    expect(res.status).toBe(201);
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await POST(makePostReq({ email: 'hello@example.com' }));
    expect(res.status).toBe(401);
  });

  test('normalises email to lowercase', async () => {
    const res = await POST(makePostReq({ email: 'Hello@Example.COM' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.address.email).toBe('hello@example.com');
  });
});
