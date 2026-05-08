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

const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.S3_BUCKET = 'hermes-email-store';

import { POST } from '@/app/api/uploads/route';

const mockRequireAuth = requireAuth as jest.Mock;

function makeFile(name: string, content: string, type: string) {
  return new File([content], name, { type });
}

function makeFormDataReq(file?: File) {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  const req = new NextRequest('http://localhost/api/uploads', {
    method: 'POST',
    body: formData,
  });
  return req;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
  mockS3Send.mockResolvedValue({});
});

// ── POST /api/uploads ────────────────────────────────────────────────────────

describe('POST /api/uploads', () => {
  test('returns 201 with s3Key, filename, size, and contentType', async () => {
    const file = makeFile('report.pdf', 'pdf content', 'application/pdf');
    const res = await POST(makeFormDataReq(file));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.filename).toBe('report.pdf');
    expect(body.contentType).toBe('application/pdf');
    expect(body.size).toBe(file.size);
    expect(body.s3Key).toMatch(/^uploads\/[0-9a-f-]{36}\/report\.pdf$/);
  });

  test('stores file in S3 at uploads/<uuid>/<filename>', async () => {
    const file = makeFile('image.png', 'png data', 'image/png');
    await POST(makeFormDataReq(file));

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const putArg = mockS3Send.mock.calls[0][0] as Record<string, unknown>;
    expect(putArg).toMatchObject({
      Bucket: 'hermes-email-store',
      ContentType: 'image/png',
    });
    expect((putArg.Key as string)).toMatch(/^uploads\/[0-9a-f-]{36}\/image\.png$/);
  });

  test('uses correct file content as S3 Body', async () => {
    const content = 'hello world file content';
    const file = makeFile('hello.txt', content, 'text/plain');
    await POST(makeFormDataReq(file));

    const putArg = mockS3Send.mock.calls[0][0] as Record<string, unknown>;
    expect(Buffer.from(putArg.Body as Buffer).toString()).toBe(content);
  });

  test('generates a unique s3Key for each upload', async () => {
    const file = makeFile('doc.txt', 'content', 'text/plain');
    const [res1, res2] = await Promise.all([
      POST(makeFormDataReq(file)),
      POST(makeFormDataReq(file)),
    ]);
    const [body1, body2] = await Promise.all([res1.json(), res2.json()]);
    expect(body1.s3Key).not.toBe(body2.s3Key);
  });

  test('falls back to application/octet-stream when contentType is empty', async () => {
    const file = makeFile('data.bin', 'bytes', '');
    const res = await POST(makeFormDataReq(file));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.contentType).toBe('application/octet-stream');
  });

  test('returns 400 when file field is missing', async () => {
    const req = new NextRequest('http://localhost/api/uploads', {
      method: 'POST',
      body: new FormData(),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('file');
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await POST(makeFormDataReq(makeFile('f.txt', 'x', 'text/plain')));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Missing authentication token');
  });

  test('does not call S3 when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await POST(makeFormDataReq(makeFile('f.txt', 'x', 'text/plain')));

    expect(mockS3Send).not.toHaveBeenCalled();
  });
});