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
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.MESSAGES_TABLE = 'hermes-messages';

import { GET } from '@/app/api/messages/route';

const mockRequireAuth = requireAuth as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/messages');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
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

    const res = await GET(makeReq({ address: 'inbox@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].messageId).toBe('msg-2');
    expect(body.nextCursor).toBeNull();
  });

  test('queries the correct GSI with ScanIndexForward false', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com' }));

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

    const res = await GET(makeReq({ address: 'inbox@example.com', limit: '1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nextCursor).toBe(Buffer.from(JSON.stringify(lastKey)).toString('base64'));
  });

  test('passes cursor as ExclusiveStartKey for pagination', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    const lastKey = { address: 'inbox@example.com', receivedAt: '2024-01-01T00:00:00Z', messageId: 'msg-1' };
    const cursor = Buffer.from(JSON.stringify(lastKey)).toString('base64');

    await GET(makeReq({ address: 'inbox@example.com', cursor }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      ExclusiveStartKey: lastKey,
    });
  });

  test('filters by sender using contains (case-insensitive)', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com', sender: 'Alice' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      FilterExpression: expect.stringContaining('contains(#sender, :sender)'),
      ExpressionAttributeValues: expect.objectContaining({ ':sender': 'alice' }),
    });
  });

  test('filters by subject using contains (case-insensitive)', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com', subject: 'Hello World' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      FilterExpression: expect.stringContaining('contains(#subject, :subject)'),
      ExpressionAttributeValues: expect.objectContaining({ ':subject': 'hello world' }),
    });
  });

  test('filters by from date using >= comparison', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com', from: '2024-01-01T00:00:00Z' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      FilterExpression: expect.stringContaining('#receivedAt >= :from'),
      ExpressionAttributeValues: expect.objectContaining({ ':from': '2024-01-01T00:00:00Z' }),
    });
  });

  test('filters by to date using <= comparison', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com', to: '2024-01-31T23:59:59Z' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg).toMatchObject({
      FilterExpression: expect.stringContaining('#receivedAt <= :to'),
      ExpressionAttributeValues: expect.objectContaining({ ':to': '2024-01-31T23:59:59Z' }),
    });
  });

  test('combines multiple filters with AND', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com', sender: 'alice', from: '2024-01-01T00:00:00Z', to: '2024-01-31T23:59:59Z' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    const filter = queryArg.FilterExpression as string;
    expect(filter).toContain('contains(#sender, :sender)');
    expect(filter).toContain('#receivedAt >= :from');
    expect(filter).toContain('#receivedAt <= :to');
    expect(filter).toMatch(/AND/);
  });

  test('does not include FilterExpression when no filters provided', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.FilterExpression).toBeUndefined();
  });

  test('defaults limit to 20', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.Limit).toBe(20);
  });

  test('caps limit at 100', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

    await GET(makeReq({ address: 'inbox@example.com', limit: '200' }));

    const queryArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(queryArg.Limit).toBe(100);
  });

  test('returns 400 when address is missing', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('address');
  });

  test('returns 400 for invalid cursor', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await GET(makeReq({ address: 'inbox@example.com', cursor: 'not-valid-base64-json!!!' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('cursor');
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeReq({ address: 'inbox@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Missing authentication token');
  });

  test('does not call DynamoDB when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await GET(makeReq({ address: 'inbox@example.com' }));

    expect(mockDynamoSend).not.toHaveBeenCalled();
  });
});
