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
  DeleteIdentityCommand: jest.fn((p: unknown) => p),
  DeleteReceiptRuleCommand: jest.fn((p: unknown) => p),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockDynamoSend })) },
  GetCommand: jest.fn((p: unknown) => p),
  UpdateCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.ADDRESSES_TABLE = 'hermes-addresses';
process.env.SES_RULE_SET_NAME = 'hermes-receipt-rules';

import { DELETE } from '@/app/api/addresses/[email]/route';

const mockRequireAuth = requireAuth as jest.Mock;

const ACTIVE_ITEM = {
  email: 'hello@example.com',
  domain: 'example.com',
  status: 'active',
  receiptRuleName: 'hermes-recv-hello-at-example-com',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeDeleteReq(email: string) {
  return new NextRequest(`http://localhost/api/addresses/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

function makeParams(email: string) {
  return { params: Promise.resolve({ email: encodeURIComponent(email) }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
});

// ── DELETE /api/addresses/:email ────────────────────────────────────────────

describe('DELETE /api/addresses/:email', () => {
  test('returns 204 and soft-deletes an active address', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: ACTIVE_ITEM });
    mockSesSend.mockResolvedValue({});
    mockDynamoSend.mockResolvedValueOnce({});

    const res = await DELETE(makeDeleteReq('hello@example.com'), makeParams('hello@example.com'));

    expect(res.status).toBe(204);
  });

  test('deletes SES identity for the address', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: ACTIVE_ITEM });
    mockSesSend.mockResolvedValue({});
    mockDynamoSend.mockResolvedValueOnce({});

    await DELETE(makeDeleteReq('hello@example.com'), makeParams('hello@example.com'));

    const identityCall = (mockSesSend.mock.calls as Array<[Record<string, unknown>]>).find(
      ([cmd]) => 'Identity' in cmd,
    )?.[0];
    expect(identityCall).toMatchObject({ Identity: 'hello@example.com' });
  });

  test('deletes SES receipt rule using stored rule name', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: ACTIVE_ITEM });
    mockSesSend.mockResolvedValue({});
    mockDynamoSend.mockResolvedValueOnce({});

    await DELETE(makeDeleteReq('hello@example.com'), makeParams('hello@example.com'));

    const ruleCall = (mockSesSend.mock.calls as Array<[Record<string, unknown>]>).find(
      ([cmd]) => 'RuleName' in cmd,
    )?.[0];
    expect(ruleCall).toMatchObject({
      RuleSetName: 'hermes-receipt-rules',
      RuleName: ACTIVE_ITEM.receiptRuleName,
    });
  });

  test('soft-deletes address in DynamoDB with status: deleted', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: ACTIVE_ITEM });
    mockSesSend.mockResolvedValue({});
    mockDynamoSend.mockResolvedValueOnce({});

    await DELETE(makeDeleteReq('hello@example.com'), makeParams('hello@example.com'));

    const updateCall = (mockDynamoSend.mock.calls as Array<[Record<string, unknown>]>).find(
      ([cmd]) => 'UpdateExpression' in cmd,
    )?.[0];
    expect(updateCall).toMatchObject({
      TableName: 'hermes-addresses',
      Key: { email: 'hello@example.com' },
      ExpressionAttributeValues: expect.objectContaining({ ':deleted': 'deleted' }),
    });
  });

  test('returns 404 for non-existent address', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: undefined });

    const res = await DELETE(makeDeleteReq('ghost@example.com'), makeParams('ghost@example.com'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Address not found');
  });

  test('returns 404 for already soft-deleted address', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...ACTIVE_ITEM, status: 'deleted' } });

    const res = await DELETE(makeDeleteReq('hello@example.com'), makeParams('hello@example.com'));

    expect(res.status).toBe(404);
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await DELETE(makeDeleteReq('hello@example.com'), makeParams('hello@example.com'));

    expect(res.status).toBe(401);
  });

  test('decodes and normalises URL-encoded email', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...ACTIVE_ITEM, email: 'hello@example.com' } });
    mockSesSend.mockResolvedValue({});
    mockDynamoSend.mockResolvedValueOnce({});

    const res = await DELETE(
      makeDeleteReq('Hello%40Example.COM'),
      { params: Promise.resolve({ email: 'Hello%40Example.COM' }) },
    );

    expect(res.status).toBe(204);

    const identityCall = (mockSesSend.mock.calls as Array<[Record<string, unknown>]>).find(
      ([cmd]) => 'Identity' in cmd,
    )?.[0];
    expect(identityCall).toMatchObject({ Identity: 'hello@example.com' });
  });
});
