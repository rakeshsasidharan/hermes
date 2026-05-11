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
  ScanCommand: jest.fn((p: unknown) => p),
  PutCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.DRAFTS_TABLE = 'hermes-drafts';

import { GET, POST } from '@/app/api/drafts/route';

const mockRequireAuth = requireAuth as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

function makeGetReq() {
  return new NextRequest('http://localhost/api/drafts');
}

function makePostReq(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── GET /api/drafts ─────────────────────────────────────────────────────────

describe('GET /api/drafts', () => {
  test('returns only drafts belonging to the authenticated user', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Items: [
        { draftId: 'draft-1', userId: 'user-1', subject: 'Hello', updatedAt: '2024-01-02T00:00:00Z' },
        { draftId: 'draft-2', userId: 'user-1', subject: 'World', updatedAt: '2024-01-01T00:00:00Z' },
      ],
    });

    const res = await GET(makeGetReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.drafts).toHaveLength(2);
    expect(json.drafts[0].draftId).toBe('draft-1');
  });

  test('filters by userId in the scan', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-42' });
    mockDynamoSend.mockResolvedValue({ Items: [] });

    await GET(makeGetReq());

    const scanArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(scanArg).toMatchObject({
      TableName: 'hermes-drafts',
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': 'user-42' },
    });
  });

  test('returns drafts sorted newest-first by updatedAt', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Items: [
        { draftId: 'draft-old', userId: 'user-1', updatedAt: '2024-01-01T00:00:00Z' },
        { draftId: 'draft-new', userId: 'user-1', updatedAt: '2024-01-03T00:00:00Z' },
        { draftId: 'draft-mid', userId: 'user-1', updatedAt: '2024-01-02T00:00:00Z' },
      ],
    });

    const res = await GET(makeGetReq());
    const json = await res.json();

    expect(json.drafts[0].draftId).toBe('draft-new');
    expect(json.drafts[1].draftId).toBe('draft-mid');
    expect(json.drafts[2].draftId).toBe('draft-old');
  });

  test('returns empty array when user has no drafts', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [] });

    const res = await GET(makeGetReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.drafts).toEqual([]);
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeGetReq());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Missing authentication token');
  });

  test('does not call DynamoDB when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await GET(makeGetReq());

    expect(mockDynamoSend).not.toHaveBeenCalled();
  });
});

// ── POST /api/drafts ─────────────────────────────────────────────────────────

describe('POST /api/drafts', () => {
  test('creates draft and returns 201 with draftId', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({});

    const res = await POST(makePostReq({ from: 'me@hermes.com', subject: 'Draft subject' }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.draftId).toBeDefined();
  });

  test('stores userId from JWT claims in the draft', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-99' });
    mockDynamoSend.mockResolvedValue({});

    await POST(makePostReq({ subject: 'Test' }));

    const putArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    const item = (putArg as Record<string, unknown>).Item as Record<string, unknown>;
    expect(item.userId).toBe('user-99');
  });

  test('stores all provided draft fields', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({});

    const draft = {
      from: 'me@hermes.com',
      to: 'them@example.com',
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      subject: 'Hello',
      body: 'Draft body',
      attachmentKeys: ['uploads/uuid/file.pdf'],
      inReplyToMessageId: 'msg-original',
    };

    await POST(makePostReq(draft));

    const putArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    const item = (putArg as Record<string, unknown>).Item as Record<string, unknown>;
    expect(item.from).toBe('me@hermes.com');
    expect(item.to).toBe('them@example.com');
    expect(item.cc).toBe('cc@example.com');
    expect(item.bcc).toBe('bcc@example.com');
    expect(item.subject).toBe('Hello');
    expect(item.body).toBe('Draft body');
    expect(item.attachmentKeys).toEqual(['uploads/uuid/file.pdf']);
    expect(item.inReplyToMessageId).toBe('msg-original');
  });

  test('stores createdAt and updatedAt timestamps', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({});

    await POST(makePostReq());

    const putArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    const item = (putArg as Record<string, unknown>).Item as Record<string, unknown>;
    expect(item.createdAt).toBeDefined();
    expect(item.updatedAt).toBeDefined();
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await POST(makePostReq());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Missing authentication token');
  });
});
