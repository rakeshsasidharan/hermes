/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '@/middleware';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
}));

jest.mock('@/lib/auth/jwks-cache', () => ({
  getJwks: jest.fn().mockReturnValue(Symbol('jwks')),
}));

jest.mock('@/lib/auth/cognito', () => ({
  refreshAccessToken: jest.fn(),
  CognitoAuthError: class CognitoAuthError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'CognitoAuthError';
    }
  },
}));

import { jwtVerify } from 'jose';
import { refreshAccessToken, CognitoAuthError } from '@/lib/auth/cognito';

const mockJwtVerify = jwtVerify as jest.Mock;
const mockRefresh = refreshAccessToken as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  const req = new NextRequest(url);

  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }

  return req;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.COGNITO_USER_POOL_ID = 'us-east-1_TestPool';
  process.env.AWS_REGION = 'us-east-1';
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('middleware', () => {
  describe('public paths', () => {
    test('/login is accessible without authentication', async () => {
      const req = makeReq('/login');
      const res = await middleware(req);
      expect(res.status).not.toBe(302);
    });

    test('/api/auth/signout is accessible without authentication', async () => {
      const req = makeReq('/api/auth/signout');
      const res = await middleware(req);
      expect(res.status).not.toBe(302);
    });
  });

  describe('unauthenticated requests to protected routes', () => {
    test('redirects to /login when no cookies present', async () => {
      const req = makeReq('/');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });

    test('redirects to /login for any protected route', async () => {
      const req = makeReq('/inbox');
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });
  });

  describe('valid access token', () => {
    test('allows the request to proceed', async () => {
      mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'user-1' } });

      const req = makeReq('/', { access_token: 'valid.jwt.token' });
      const res = await middleware(req);

      expect(res.status).not.toBe(307);
    });
  });

  describe('expired access token with valid refresh token', () => {
    test('refreshes the access token and allows the request', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('JWTExpired'));
      mockRefresh.mockResolvedValueOnce({
        accessToken: 'new.access.token',
        refreshToken: 'existing.refresh.token',
        idToken: 'new.id.token',
        expiresIn: 3600,
      });

      const req = makeReq('/', {
        access_token: 'expired.token',
        refresh_token: 'valid.refresh.token',
      });
      const res = await middleware(req);

      expect(res.status).not.toBe(307);
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('access_token=new.access.token');
    });
  });

  describe('expired access token with invalid refresh token', () => {
    test('redirects to /login and clears cookies', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('JWTExpired'));
      mockRefresh.mockRejectedValueOnce(new CognitoAuthError('Refresh token expired'));

      const req = makeReq('/', {
        access_token: 'expired.token',
        refresh_token: 'expired.refresh',
      });
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    });
  });

  describe('sign-out', () => {
    test('POST /api/auth/signout is accessible (public path)', async () => {
      const req = makeReq('/api/auth/signout');
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    });
  });
});
