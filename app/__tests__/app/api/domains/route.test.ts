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

const mockSesSend = jest.fn();

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  ListIdentitiesCommand: jest.fn((p: unknown) => p),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import { GET } from '@/app/api/domains/route';

const mockRequireAuth = requireAuth as jest.Mock;

function makeReq() {
  return new NextRequest('http://localhost/api/domains');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/domains', () => {
  test('returns verified domains for authenticated request', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockSesSend.mockResolvedValue({ Identities: ['example.com', 'mail.example.com'] });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ domains: ['example.com', 'mail.example.com'] });
  });

  test('returns empty list when no domains are verified', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockSesSend.mockResolvedValue({ Identities: [] });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ domains: [] });
  });

  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Missing authentication token');
  });

  test('does not call SES when auth fails', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    await GET(makeReq());

    expect(mockSesSend).not.toHaveBeenCalled();
  });
});
