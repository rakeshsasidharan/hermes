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

const mockDynamoSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockDynamoSend })) },
  QueryCommand: jest.fn((p: unknown) => p),
  PutCommand: jest.fn((p: unknown) => p),
  DeleteCommand: jest.fn((p: unknown) => p),
}));

const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  GetObjectCommand: jest.fn((p: unknown) => p),
  PutObjectCommand: jest.fn((p: unknown) => p),
}));

const mockSESSend = jest.fn();
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSESSend })),
  SendRawEmailCommand: jest.fn((p: unknown) => p),
}));

jest.mock('nodemailer', () => ({
  default: { createTransport: jest.fn() },
  createTransport: jest.fn(),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import nodemailer from 'nodemailer';

process.env.MESSAGES_TABLE = 'hermes-messages';
process.env.DRAFTS_TABLE = 'hermes-drafts';
process.env.S3_BUCKET = 'hermes-email-store';

import { GET, POST } from '@/app/api/messages/route';

const mockRequireAuth = requireAuth as jest.Mock;
const mockCreateTransport = nodemailer.createTransport as jest.Mock;
let mockSendMail: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail = jest.fn().mockResolvedValue({ message: Buffer.from('raw-mime') });
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
  mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });
  mockSESSend.mockResolvedValue({ MessageId: 'ses-msg-id' });
});

function makeGetReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/messages');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
}

function makePostReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── GET /api/messages ───────────────────────────────────────────────────────

describe('GET /api/messages', () => {
  test('returns messages newest-first for authenticated request with address', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Items: [
        { messageId: 'msg-2', address: 'inbox@example.com', receivedAt: '2024-01-02T00:00:00Z', sender: 'alice@test.com', subject: 'Hello' },
        { messageId: 'msg-1', address: 'inbox@example.com', receivedAt: '2024-01-01T00:00:00Z', sender: 'bob@test.com', subject: 'World' },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await GET(makeGetReq({ address: 'inbox@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].messageId).toBe('msg-2');
    expect(body.nextCursor).toBeNull();
  });

  test('queries the correct GSI with ScanIndexForward false', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      TableName: 'hermes-messages',
      IndexName: 'address-receivedAt-index',
      ScanIndexForward: false,
      ExpressionAttributeValues: expect.objectContaining({ ':address': 'inbox@example.com' }),
    });
  });

  test('returns nextCursor when DynamoDB returns LastEvaluatedKey', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    const lastKey = { address: 'inbox@example.com', receivedAt: '2024-01-01T00:00:00Z', messageId: 'msg-1' };
    mockDynamoSend.mockResolvedValue({
      Items: [{ messageId: 'msg-2', address: 'inbox@example.com', receivedAt: '2024-01-02T00:00:00Z' }],
      LastEvaluatedKey: lastKey,
    });

    const res = await GET(makeGetReq({ address: 'inbox@example.com', limit: '1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nextCursor).toBe(Buffer.from(JSON.stringify(lastKey)).toString('base64'));
  });

  test('passes cursor as ExclusiveStartKey for pagination', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    const lastKey = { address: 'inbox@example.com', receivedAt: '2024-01-01T00:00:00Z', messageId: 'msg-1' };
    const cursor = Buffer.from(JSON.stringify(lastKey)).toString('base64');

    await GET(makeGetReq({ address: 'inbox@example.com', cursor }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({ ExclusiveStartKey: lastKey });
  });

  test('filters by sender searching the from attribute (lowercased value)', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', sender: 'Alice' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      FilterExpression: expect.stringContaining('contains(#from, :sender)'),
      ExpressionAttributeNames: expect.objectContaining({ '#from': 'from' }),
      ExpressionAttributeValues: expect.objectContaining({ ':sender': 'alice' }),
    });
  });

  test('filters by subject using contains preserving original case', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', subject: 'Hello World' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      FilterExpression: expect.stringContaining('contains(#subject, :subject)'),
      ExpressionAttributeValues: expect.objectContaining({ ':subject': 'Hello World' }),
    });
  });

  test('date after filter uses KeyConditionExpression range on GSI sort key', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', from: '2024-01-01' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      KeyConditionExpression: expect.stringContaining('#receivedAt >= :from'),
      ExpressionAttributeValues: expect.objectContaining({ ':from': '2024-01-01' }),
    });
    expect(queryArg.FilterExpression ?? '').not.toContain('#receivedAt');
  });

  test('date before filter uses KeyConditionExpression range and appends end-of-day', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', to: '2024-01-31' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      KeyConditionExpression: expect.stringContaining('#receivedAt <= :to'),
      ExpressionAttributeValues: expect.objectContaining({ ':to': '2024-01-31T23:59:59.999Z' }),
    });
    expect(queryArg.FilterExpression ?? '').not.toContain('#receivedAt');
  });

  test('both date filters use BETWEEN in KeyConditionExpression', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', from: '2024-01-01', to: '2024-01-31' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      KeyConditionExpression: expect.stringContaining('BETWEEN :from AND :to'),
      ExpressionAttributeValues: expect.objectContaining({
        ':from': '2024-01-01',
        ':to': '2024-01-31T23:59:59.999Z',
      }),
    });
  });

  test('combines sender and subject filters with AND in FilterExpression', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', sender: 'alice', subject: 'Hello', from: '2024-01-01' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.KeyConditionExpression).toContain('#receivedAt >= :from');
    const filter = queryArg.FilterExpression as string;
    expect(filter).toContain('contains(#from, :sender)');
    expect(filter).toContain('contains(#subject, :subject)');
    expect(filter).toMatch(/AND/);
    expect(filter).not.toContain('#receivedAt');
  });

  test('does not include FilterExpression when no filters provided', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.FilterExpression).toBeUndefined();
  });

  test('folder=junk filters by folder attribute only', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', folder: 'junk' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.FilterExpression).toContain('#folder = :folder');
    expect(queryArg.ExpressionAttributeValues).toMatchObject({ ':folder': 'junk' });
    expect(queryArg.FilterExpression).not.toContain('#direction');
  });

  test('folder=inbox filters by direction=inbound and folder=inbox or missing', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', folder: 'inbox' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.FilterExpression).toContain('#direction = :inbound');
    expect(queryArg.FilterExpression).toContain('attribute_not_exists(#folder)');
    expect(queryArg.ExpressionAttributeValues).toMatchObject({ ':inbound': 'inbound', ':folder': 'inbox' });
  });

  test('folder param takes precedence over direction param', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', folder: 'junk', direction: 'inbound' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.FilterExpression).toContain('#folder = :folder');
    expect(queryArg.FilterExpression).not.toContain('#direction = :direction');
  });

  test('defaults limit to 20', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.Limit).toBe(20);
  });

  test('caps limit at 100', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeGetReq({ address: 'inbox@example.com', limit: '200' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.Limit).toBe(100);
  });

  test('returns 400 when address is missing', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await GET(makeGetReq());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('address');
  });

  test('returns 400 for invalid cursor', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await GET(makeGetReq({ address: 'inbox@example.com', cursor: 'not-valid-base64-json!!!' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('cursor');
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeGetReq({ address: 'inbox@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Missing authentication token');
  });

  test('does not call DynamoDB when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await GET(makeGetReq({ address: 'inbox@example.com' }));

    expect(mockDynamoSend).not.toHaveBeenCalled();
  });
});

// ── POST /api/messages ──────────────────────────────────────────────────────

describe('POST /api/messages', () => {
  const validBody = {
    from: 'me@hermes.com',
    to: 'recipient@example.com',
    subject: 'Hello',
    body: 'Hello there',
  };

  test('sends email via SES and returns 201 with messageId', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await POST(makePostReq(validBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.messageId).toBeDefined();
    expect(mockSESSend).toHaveBeenCalledTimes(1);
  });

  test('writes outbound record to DynamoDB with correct fields', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makePostReq(validBody));

    const putArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0] as Record<string, unknown>;
    const item = putArg.Item as Record<string, unknown>;
    expect(putArg.TableName).toBe('hermes-messages');
    expect(item.direction).toBe('outbound');
    expect(item.from).toBe('me@hermes.com');
    expect(item.to).toBe('recipient@example.com');
    expect(item.subject).toBe('Hello');
    expect(item.isRead).toBe(true);
    expect(item.address).toBe('me@hermes.com');
  });

  test('stores snippet (first 300 chars of body) in DynamoDB record', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    const longBody = 'A'.repeat(400);

    await POST(makePostReq({ ...validBody, body: longBody }));

    const putArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0] as Record<string, unknown>;
    const item = putArg.Item as Record<string, unknown>;
    expect(typeof item.snippet).toBe('string');
    expect((item.snippet as string).length).toBe(300);
  });

  test('includes attachments in MIME message when attachmentKeys provided', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    async function* fakeStream() { yield Buffer.from('file-content'); }
    mockS3Send.mockResolvedValue({ Body: fakeStream(), ContentType: 'application/pdf' });

    await POST(makePostReq({ ...validBody, attachmentKeys: ['uploads/uuid/report.pdf'] }));

    const sendMailArg = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    const attachments = sendMailArg.attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('report.pdf');
    expect(attachments[0].contentType).toBe('application/pdf');
  });

  test('deletes draft after send when draftId is provided', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makePostReq({ ...validBody, draftId: 'draft-abc' }));

    const deleteArg = (mockDynamoSend.mock.calls[1] as [Record<string, unknown>])[0] as Record<string, unknown>;
    expect(deleteArg.TableName).toBe('hermes-drafts');
    expect((deleteArg.Key as Record<string, unknown>).draftId).toBe('draft-abc');
  });

  test('does not call delete when no draftId', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makePostReq(validBody));

    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
  });

  test('returns 400 when required fields are missing', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await POST(makePostReq({ from: 'me@hermes.com' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('required');
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await POST(makePostReq(validBody));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Missing authentication token');
  });

  test('does not call SES when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await POST(makePostReq(validBody));

    expect(mockSESSend).not.toHaveBeenCalled();
  });
});
