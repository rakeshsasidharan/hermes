/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

const mockDynamoSend = jest.fn();
const mockSesSend = jest.fn();
const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockDynamoSend })) },
  GetCommand: jest.fn((p: unknown) => p),
  PutCommand: jest.fn((p: unknown) => p),
}));

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn((p: unknown) => p),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn((p: unknown) => p),
}));

process.env.API_KEYS_TABLE = 'hermes-api-keys';
process.env.MESSAGES_TABLE = 'hermes-messages';
process.env.S3_BUCKET = 'hermes-email-store';

import { POST } from '@/app/api/send/route';

const VALID_KEY = 'hmrs_' + 'a'.repeat(64);

function makeRequest(body: unknown, apiKey?: string) {
  return new NextRequest('http://localhost/api/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSesSend.mockResolvedValue({ MessageId: 'ses-message-id-123' });
  mockS3Send.mockResolvedValue({});
  mockDynamoSend.mockResolvedValue({});
});

describe('POST /api/send', () => {
  test('returns 401 when no Authorization header', async () => {
    const res = await POST(makeRequest({ from: 'a@b.com', to: 'c@d.com', subject: 'Hi', body: 'Hello' }));
    expect(res.status).toBe(401);
  });

  test('returns 401 when key does not start with hmrs_', async () => {
    const res = await POST(makeRequest({}, 'invalid_key_format'));
    expect(res.status).toBe(401);
  });

  test('returns 401 when key not found in DynamoDB', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const res = await POST(makeRequest({}, VALID_KEY));
    expect(res.status).toBe(401);
  });

  test('returns 400 when required fields are missing', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { keyHash: 'hash', address: 'from@example.com' } });
    const res = await POST(makeRequest({ from: 'from@example.com' }, VALID_KEY));
    expect(res.status).toBe(400);
  });

  test('returns 403 when from address does not match API key address', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { keyHash: 'hash', address: 'other@example.com' } });
    const res = await POST(makeRequest({
      from: 'from@example.com',
      to: 'dest@example.com',
      subject: 'Test',
      body: 'Hello',
    }, VALID_KEY));
    expect(res.status).toBe(403);
  });

  test('sends email and returns 201 with messageId', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: { keyHash: 'hash', address: 'from@example.com' } })
      .mockResolvedValueOnce({});

    const res = await POST(makeRequest({
      from: 'from@example.com',
      to: ['dest@example.com'],
      subject: 'Hello from Hermes',
      body: { text: 'Plain text body', html: '<p>HTML body</p>' },
    }, VALID_KEY));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.messageId).toBeDefined();
    expect(body.sesMessageId).toBe('ses-message-id-123');
    expect(mockSesSend).toHaveBeenCalledTimes(1);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
  });

  test('accepts string body in addition to object body', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: { keyHash: 'hash', address: 'from@example.com' } })
      .mockResolvedValueOnce({});

    const res = await POST(makeRequest({
      from: 'from@example.com',
      to: 'dest@example.com',
      subject: 'Test',
      body: 'Plain string body',
    }, VALID_KEY));

    expect(res.status).toBe(201);
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });
});
