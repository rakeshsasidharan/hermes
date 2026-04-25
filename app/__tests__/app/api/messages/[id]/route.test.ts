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
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  GetObjectCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const mockGetSignedUrl = getSignedUrl as jest.Mock;

process.env.MESSAGES_TABLE = 'hermes-messages';
process.env.S3_BUCKET = 'hermes-email-store';

import { GET } from '@/app/api/messages/[id]/route';

const mockRequireAuth = requireAuth as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/messages/${id}`);
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ── GET /api/messages/:id ────────────────────────────────────────────────────

describe('GET /api/messages/:id', () => {
  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Missing authentication token');
  });

  test('does not query DynamoDB when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await GET(makeReq('msg-1'), makeParams('msg-1'));

    expect(mockDynamoSend).not.toHaveBeenCalled();
  });

  test('returns 404 for non-existent message id', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: undefined });

    const res = await GET(makeReq('does-not-exist'), makeParams('does-not-exist'));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Message not found');
  });

  test('returns message with pre-signed bodyHtmlUrl when bodyHtmlS3Key is present', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        subject: 'Hello',
        bodyHtmlS3Key: 'emails/msg-1/body.html',
      },
    });
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-html-url');

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message.bodyHtmlUrl).toBe('https://s3.example.com/signed-html-url');
    expect(body.message.bodyHtmlS3Key).toBeUndefined();
  });

  test('returns message with pre-signed bodyTextUrl when bodyTextS3Key is present', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        subject: 'Hello',
        bodyTextS3Key: 'emails/msg-1/body.txt',
      },
    });
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-text-url');

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message.bodyTextUrl).toBe('https://s3.example.com/signed-text-url');
    expect(body.message.bodyTextS3Key).toBeUndefined();
  });

  test('omits bodyHtmlUrl when bodyHtmlS3Key is absent', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        subject: 'Hello',
        bodyTextS3Key: 'emails/msg-1/body.txt',
      },
    });
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-text-url');

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message.bodyHtmlUrl).toBeUndefined();
    expect(body.message.bodyHtmlS3Key).toBeUndefined();
  });

  test('omits bodyTextUrl when bodyTextS3Key is absent', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        subject: 'Hello',
        bodyHtmlS3Key: 'emails/msg-1/body.html',
      },
    });
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-html-url');

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message.bodyTextUrl).toBeUndefined();
    expect(body.message.bodyTextS3Key).toBeUndefined();
  });

  test('returns pre-signed URLs for all attachments with s3Key', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        subject: 'Hello',
        attachments: [
          { filename: 'file1.pdf', s3Key: 'attachments/msg-1/file1.pdf' },
          { filename: 'file2.png', s3Key: 'attachments/msg-1/file2.png' },
        ],
      },
    });
    mockGetSignedUrl
      .mockResolvedValueOnce('https://s3.example.com/signed-file1')
      .mockResolvedValueOnce('https://s3.example.com/signed-file2');

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message.attachments).toHaveLength(2);
    expect(body.message.attachments[0].url).toBe('https://s3.example.com/signed-file1');
    expect(body.message.attachments[0].s3Key).toBeUndefined();
    expect(body.message.attachments[1].url).toBe('https://s3.example.com/signed-file2');
    expect(body.message.attachments[1].s3Key).toBeUndefined();
  });

  test('skips attachments without s3Key', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        subject: 'Hello',
        attachments: [
          { filename: 'inline.png' },
          { filename: 'file2.pdf', s3Key: 'attachments/msg-1/file2.pdf' },
        ],
      },
    });
    mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/signed-file2');

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message.attachments).toHaveLength(2);
    expect(body.message.attachments[0].url).toBeUndefined();
    expect(body.message.attachments[0].filename).toBe('inline.png');
    expect(body.message.attachments[1].url).toBe('https://s3.example.com/signed-file2');
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  test('does not expose raw S3 keys in response', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        subject: 'Hello',
        bodyHtmlS3Key: 'emails/msg-1/body.html',
        bodyTextS3Key: 'emails/msg-1/body.txt',
        attachments: [
          { filename: 'file.pdf', s3Key: 'attachments/msg-1/file.pdf' },
        ],
      },
    });
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-url');

    const res = await GET(makeReq('msg-1'), makeParams('msg-1'));
    const body = await res.json();

    expect(body.message.bodyHtmlS3Key).toBeUndefined();
    expect(body.message.bodyTextS3Key).toBeUndefined();
    expect(body.message.attachments[0].s3Key).toBeUndefined();
  });

  test('uses correct DynamoDB table and key', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: { messageId: 'msg-42', subject: 'Test' } });

    await GET(makeReq('msg-42'), makeParams('msg-42'));

    const getArg = mockDynamoSend.mock.calls[0][0] as Record<string, unknown>;
    expect(getArg).toMatchObject({
      TableName: 'hermes-messages',
      Key: { messageId: 'msg-42' },
    });
  });

  test('generates pre-signed URL with correct S3 bucket and key', async () => {
    const { GetObjectCommand } = jest.requireMock('@aws-sdk/client-s3');
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Item: {
        messageId: 'msg-1',
        bodyHtmlS3Key: 'emails/msg-1/body.html',
      },
    });
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-url');

    await GET(makeReq('msg-1'), makeParams('msg-1'));

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'hermes-email-store',
      Key: 'emails/msg-1/body.html',
    });
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 900 },
    );
  });
});
