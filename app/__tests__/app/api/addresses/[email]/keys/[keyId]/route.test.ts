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
  DeleteCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.API_KEYS_TABLE = 'hermes-api-keys';

import { DELETE } from '@/app/api/addresses/[email]/keys/[keyId]/route';

const mockRequireAuth = requireAuth as jest.Mock;

function params(email: string, keyId: string) {
  return Promise.resolve({ email: encodeURIComponent(email), keyId });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({});
});

describe('DELETE /api/addresses/[email]/keys/[keyId]', () => {
  test('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Unauthorized', 401));
    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys/key-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: params('test@example.com', 'key-1') });
    expect(res.status).toBe(401);
  });

  test('returns 404 when key not found for address', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });
    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys/missing-id', {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: params('test@example.com', 'missing-id') });
    expect(res.status).toBe(404);
  });

  test('revokes key and returns 204', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Items: [{ keyHash: 'hash-abc', keyId: 'key-1', address: 'test@example.com' }] })
      .mockResolvedValueOnce({});
    const req = new NextRequest('http://localhost/api/addresses/test@example.com/keys/key-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: params('test@example.com', 'key-1') });
    expect(res.status).toBe(204);
    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
  });
});
