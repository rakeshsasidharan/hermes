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
  QueryCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.ADDRESSES_TABLE = 'hermes-addresses';
process.env.API_KEYS_TABLE = 'hermes-api-keys';

import { GET, POST } from '@/app/api/addresses/[email]/keys/route';

const mockRequireAuth = requireAuth as jest.Mock;

function params(email: string) {
  return Promise.resolve({ email: encodeURIComponent(email) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({});
});

describe('GET /api/addresses/[email]/keys', () => {
  test('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Unauthorized', 401));
    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys');
    const res = await GET(req, { params: params('test@example.com') });
    expect(res.status).toBe(401);
  });

  test('returns list of keys without keyHash', async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { keyHash: 'abc123', keyId: 'id-1', address: 'test@example.com', prefix: 'hmrs_abcd...', createdAt: '2024-01-01T00:00:00.000Z' },
      ],
    });
    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys');
    const res = await GET(req, { params: params('test@example.com') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].keyId).toBe('id-1');
    expect(body.keys[0].keyHash).toBeUndefined();
  });

  test('returns empty array when no keys exist', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });
    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys');
    const res = await GET(req, { params: params('test@example.com') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toEqual([]);
  });
});

describe('POST /api/addresses/[email]/keys', () => {
  test('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Unauthorized', 401));
    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: params('test@example.com') });
    expect(res.status).toBe(401);
  });

  test('returns 404 when address does not exist', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const req = new NextRequest('http://localhost/api/addresses/missing@example.com/keys', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: params('missing@example.com') });
    expect(res.status).toBe(404);
  });

  test('returns 404 when address is deleted', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { email: 'gone@example.com', status: 'deleted' } });
    const req = new NextRequest('http://localhost/api/addresses/gone@example.com/keys', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: params('gone@example.com') });
    expect(res.status).toBe(404);
  });

  test('generates a key and returns it once with prefix', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: { email: 'test@example.com', status: 'active' } })
      .mockResolvedValueOnce({});

    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: params('test@example.com') });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key).toMatch(/^hmrs_[0-9a-f]{64}$/);
    expect(body.prefix).toMatch(/^hmrs_[0-9a-f]{8}\.\.\./);
    expect(body.keyId).toBeDefined();
    expect(body.address).toBe('test@example.com');
  });

  test('stores label when provided', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: { email: 'test@example.com', status: 'active' } })
      .mockResolvedValueOnce({});

    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'pandaura contact form' }),
    });
    const res = await POST(req, { params: params('test@example.com') });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.label).toBe('pandaura contact form');
  });
});
