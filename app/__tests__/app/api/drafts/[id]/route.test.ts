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
  GetCommand: jest.fn((p: unknown) => p),
  UpdateCommand: jest.fn((p: unknown) => p),
  DeleteCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.DRAFTS_TABLE = 'hermes-drafts';

import { GET, PUT, DELETE } from '@/app/api/drafts/[id]/route';

const mockRequireAuth = requireAuth as jest.Mock;

function makeParams(id = 'draft-1') {
  return Promise.resolve({ id });
}

function makePutReq(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/drafts/draft-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq() {
  return new NextRequest('http://localhost/api/drafts/draft-1', { method: 'DELETE' });
}

const DRAFT_ITEM = {
  draftId: 'draft-1',
  userId: 'user-1',
  subject: 'Original subject',
  updatedAt: '2024-01-01T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

function makeGetReq() {
  return new NextRequest('http://localhost/api/drafts/draft-1', { method: 'GET' });
}

// ── GET /api/drafts/:id ──────────────────────────────────────────────────────

describe('GET /api/drafts/:id', () => {
  test('returns 200 with draft when found and owned by user', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: DRAFT_ITEM });

    const res = await GET(makeGetReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.draft.draftId).toBe('draft-1');
  });

  test('returns 404 when draft not found', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: undefined });

    const res = await GET(makeGetReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toContain('not found');
  });

  test('returns 403 when draft belongs to another user', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'different-user' });
    mockDynamoSend.mockResolvedValue({ Item: DRAFT_ITEM });

    const res = await GET(makeGetReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden');
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeGetReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Missing authentication token');
  });
});

// ── PUT /api/drafts/:id ──────────────────────────────────────────────────────

describe('PUT /api/drafts/:id', () => {
  test('updates draft and returns 200 with draftId', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({});

    const res = await PUT(makePutReq({ subject: 'Updated subject', body: 'New content' }), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.draftId).toBe('draft-1');
  });

  test('sends UpdateCommand to the correct table', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({});

    await PUT(makePutReq({ subject: 'Hello' }), { params: makeParams() });

    const updateArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect((updateArg as Record<string, unknown>).TableName).toBe('hermes-drafts');
    expect(((updateArg as Record<string, unknown>).Key as Record<string, unknown>).draftId).toBe('draft-1');
  });

  test('includes all allowed fields in the update expression', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({});

    const fields = {
      from: 'me@hermes.com',
      to: 'them@example.com',
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      subject: 'Hello',
      body: 'Body text',
      attachmentKeys: ['uploads/key.pdf'],
      inReplyToMessageId: 'msg-1',
    };

    await PUT(makePutReq(fields), { params: makeParams() });

    const updateArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0] as Record<string, unknown>;
    const values = updateArg.ExpressionAttributeValues as Record<string, unknown>;
    expect(values[':from']).toBe('me@hermes.com');
    expect(values[':to']).toBe('them@example.com');
    expect(values[':subject']).toBe('Hello');
    expect(values[':body']).toBe('Body text');
    expect(values[':inReplyToMessageId']).toBe('msg-1');
  });

  test('uses condition to prevent unauthorized updates', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({});

    await PUT(makePutReq({ subject: 'Hello' }), { params: makeParams() });

    const updateArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0] as Record<string, unknown>;
    expect(updateArg.ConditionExpression).toContain('userId = :userId');
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await PUT(makePutReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Missing authentication token');
  });
});

// ── DELETE /api/drafts/:id ───────────────────────────────────────────────────

describe('DELETE /api/drafts/:id', () => {
  test('deletes draft and returns 204', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValueOnce({ Item: DRAFT_ITEM }).mockResolvedValueOnce({});

    const res = await DELETE(makeDeleteReq(), { params: makeParams() });

    expect(res.status).toBe(204);
  });

  test('sends DeleteCommand with correct key', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValueOnce({ Item: DRAFT_ITEM }).mockResolvedValueOnce({});

    await DELETE(makeDeleteReq(), { params: makeParams() });

    const deleteArg = (mockDynamoSend.mock.calls[1] as [Record<string, unknown>])[0] as Record<string, unknown>;
    expect(deleteArg.TableName).toBe('hermes-drafts');
    expect((deleteArg.Key as Record<string, unknown>).draftId).toBe('draft-1');
  });

  test('returns 404 when draft does not exist', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: undefined });

    const res = await DELETE(makeDeleteReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toContain('not found');
  });

  test('returns 403 when draft belongs to another user', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'different-user' });
    mockDynamoSend.mockResolvedValue({ Item: DRAFT_ITEM });

    const res = await DELETE(makeDeleteReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Forbidden');
  });

  test('does not call DeleteCommand when draft does not exist', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: undefined });

    await DELETE(makeDeleteReq(), { params: makeParams() });

    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await DELETE(makeDeleteReq(), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Missing authentication token');
  });
});
