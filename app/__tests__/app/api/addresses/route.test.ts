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
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';

process.env.ADDRESSES_TABLE = 'hermes-addresses';

import { GET } from '@/app/api/addresses/route';

const mockRequireAuth = requireAuth as jest.Mock;

function makeGetReq() {
  return new NextRequest('http://localhost/api/addresses');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/addresses', () => {
  test('returns active addresses for authenticated request', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({
      Items: [{ email: 'hello@example.com', domain: 'example.com', status: 'active' }],
    });

    const res = await GET(makeGetReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.addresses).toHaveLength(1);
    expect(body.addresses[0].email).toBe('hello@example.com');
  });

  test('returns empty list when no addresses exist', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [] });

    const res = await GET(makeGetReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ addresses: [] });
  });

  test('filters out soft-deleted addresses via FilterExpression', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockDynamoSend.mockResolvedValue({ Items: [] });

    await GET(makeGetReq());

    const scanArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(scanArg).toMatchObject({
      FilterExpression: expect.stringContaining('<>'),
      ExpressionAttributeValues: expect.objectContaining({ ':deleted': 'deleted' }),
    });
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });
});
