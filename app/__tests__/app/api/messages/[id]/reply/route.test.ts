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

import { POST } from '@/app/api/messages/[id]/reply/route';

const mockRequireAuth = requireAuth as jest.Mock;
const mockCreateTransport = nodemailer.createTransport as jest.Mock;
let mockSendMail: jest.Mock;

const ORIGINAL_MESSAGE = {
  messageId: 'orig-msg-1',
  address: 'me@hermes.com',
  direction: 'inbound',
  subject: 'Hello there',
  from: 'sender@external.com',
  to: 'me@hermes.com',
  receivedAt: '2024-01-01T00:00:00Z',
};

function makeParams(id = 'orig-msg-1') {
  return Promise.resolve({ id });
}

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/messages/orig-msg-1/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  from: 'me@hermes.com',
  to: 'sender@external.com',
  body: 'Thanks for your email',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail = jest.fn().mockResolvedValue({ message: Buffer.from('raw-mime') });
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
  mockDynamoSend.mockResolvedValue({ Item: ORIGINAL_MESSAGE });
  mockSESSend.mockResolvedValue({ MessageId: 'ses-msg-id' });
});

// ── POST /api/messages/:id/reply ────────────────────────────────────────────

describe('POST /api/messages/:id/reply', () => {
  test('returns 201 with messageId on success', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await POST(makeReq(validBody), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.messageId).toBeDefined();
  });

  test('sends reply via SES with In-Reply-To header', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makeReq(validBody), { params: makeParams() });

    expect(mockSESSend).toHaveBeenCalledTimes(1);
    const sendMailArg = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    const headers = sendMailArg.headers as Record<string, string>;
    expect(headers['In-Reply-To']).toBe('<orig-msg-1@hermes>');
    expect(headers['References']).toBe('<orig-msg-1@hermes>');
  });

  test('prefixes subject with Re: when original subject does not have it', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makeReq(validBody), { params: makeParams() });

    const sendMailArg = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(sendMailArg.subject).toBe('Re: Hello there');
  });

  test('does not double-prefix Re: when original subject already has it', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: { ...ORIGINAL_MESSAGE, subject: 'Re: Hello there' } });

    await POST(makeReq(validBody), { params: makeParams() });

    const sendMailArg = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    expect(sendMailArg.subject).toBe('Re: Hello there');
  });

  test('writes outbound record to DynamoDB with inReplyTo field', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makeReq(validBody), { params: makeParams() });

    const calls = mockDynamoSend.mock.calls as [Record<string, unknown>][];
    const putArg = calls.find(([c]) => (c as Record<string, unknown>).Item) as [Record<string, unknown>] | undefined;
    expect(putArg).toBeDefined();
    const item = (putArg![0] as Record<string, unknown>).Item as Record<string, unknown>;
    expect(item.direction).toBe('outbound');
    expect(item.inReplyTo).toBe('orig-msg-1');
    expect(item.from).toBe('me@hermes.com');
    expect(item.isRead).toBe(true);
    expect(item.status).toBe('sent');
  });

  test('includes attachments in MIME message when attachmentKeys provided', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    async function* fakeStream() { yield Buffer.from('pdf-content'); }
    mockS3Send.mockResolvedValue({ Body: fakeStream(), ContentType: 'application/pdf' });

    await POST(makeReq({ ...validBody, attachmentKeys: ['uploads/uuid/doc.pdf'] }), { params: makeParams() });

    const sendMailArg = mockSendMail.mock.calls[0][0] as Record<string, unknown>;
    const attachments = sendMailArg.attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('doc.pdf');
    expect(attachments[0].contentType).toBe('application/pdf');
  });

  test('deletes draft after send when draftId provided', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makeReq({ ...validBody, draftId: 'draft-xyz' }), { params: makeParams() });

    const calls = mockDynamoSend.mock.calls as [Record<string, unknown>][];
    const deleteArg = calls.find(
      ([c]) => ((c as Record<string, unknown>).Key as Record<string, unknown>)?.draftId !== undefined,
    ) as [Record<string, unknown>] | undefined;
    expect(deleteArg).toBeDefined();
    expect((deleteArg![0] as Record<string, unknown>).TableName).toBe('hermes-drafts');
    expect(((deleteArg![0] as Record<string, unknown>).Key as Record<string, unknown>).draftId).toBe('draft-xyz');
  });

  test('does not call delete when no draftId', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    await POST(makeReq(validBody), { params: makeParams() });

    const calls = mockDynamoSend.mock.calls as [Record<string, unknown>][];
    const deleteArg = calls.find(
      ([c]) => ((c as Record<string, unknown>).Key as Record<string, unknown>)?.draftId !== undefined,
    );
    expect(deleteArg).toBeUndefined();
  });

  test('returns 404 when original message does not exist', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Item: undefined });

    const res = await POST(makeReq(validBody), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toContain('not found');
  });

  test('returns 400 when from is missing', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await POST(makeReq({ to: 'recipient@example.com', body: 'hi' }), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('required');
  });

  test('returns 400 when to is missing', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await POST(makeReq({ from: 'me@hermes.com', body: 'hi' }), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('required');
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await POST(makeReq(validBody), { params: makeParams() });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Missing authentication token');
  });

  test('does not call SES when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await POST(makeReq(validBody), { params: makeParams() });

    expect(mockSESSend).not.toHaveBeenCalled();
  });
});
