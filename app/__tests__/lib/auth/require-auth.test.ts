import { type NextRequest } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import { clearJwksCache } from '@/lib/auth/jwks-cache';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: {
  authHeader?: string;
  accessTokenCookie?: string;
} = {}): NextRequest {
  const url = 'http://localhost:3000/api/test';
  const headers = new Headers();

  if (overrides.authHeader !== undefined) {
    headers.set('authorization', overrides.authHeader);
  }

  const req = {
    headers,
    cookies: {
      get: (name: string) => {
        if (name === 'access_token' && overrides.accessTokenCookie !== undefined) {
          return { value: overrides.accessTokenCookie };
        }
        return undefined;
      },
    },
    url,
  } as unknown as NextRequest;

  return req;
}

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/jwks-cache', () => ({
  getJwks: jest.fn(),
  clearJwksCache: jest.fn(),
}));

jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
}));

import { getJwks } from '@/lib/auth/jwks-cache';
import { jwtVerify } from 'jose';

const mockGetJwks = getJwks as jest.Mock;
const mockJwtVerify = jwtVerify as jest.Mock;
const FAKE_JWKS = Symbol('fakeJwks');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.COGNITO_USER_POOL_ID = 'us-east-1_TestPool';
  process.env.AWS_REGION = 'us-east-1';
  mockGetJwks.mockReturnValue(FAKE_JWKS);
});

afterEach(() => {
  clearJwksCache();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  describe('valid token', () => {
    test('returns decoded claims from Bearer header', async () => {
      const claims = { sub: 'user-123', 'cognito:username': 'admin', token_use: 'access' };
      mockJwtVerify.mockResolvedValueOnce({ payload: claims });

      const req = makeRequest({ authHeader: 'Bearer valid.jwt.token' });
      const result = await requireAuth(req);

      expect(result).toEqual(claims);
    });

    test('returns decoded claims from access_token cookie', async () => {
      const claims = { sub: 'user-456', email: 'admin@example.com' };
      mockJwtVerify.mockResolvedValueOnce({ payload: claims });

      const req = makeRequest({ accessTokenCookie: 'cookie.jwt.token' });
      const result = await requireAuth(req);

      expect(result).toEqual(claims);
    });

    test('prefers Authorization header over cookie', async () => {
      const claims = { sub: 'from-header' };
      mockJwtVerify.mockResolvedValueOnce({ payload: claims });

      const req = makeRequest({
        authHeader: 'Bearer header.jwt.token',
        accessTokenCookie: 'cookie.jwt.token',
      });
      const result = await requireAuth(req);

      expect(mockJwtVerify).toHaveBeenCalledWith(
        'header.jwt.token',
        FAKE_JWKS,
        expect.any(Object),
      );
      expect(result).toEqual(claims);
    });
  });

  describe('missing token', () => {
    test('throws AuthError 401 when no header and no cookie', async () => {
      const req = makeRequest();

      await expect(requireAuth(req)).rejects.toThrow(AuthError);
      await expect(requireAuth(req)).rejects.toMatchObject({ status: 401 });
    });

    test('throws AuthError with descriptive message', async () => {
      const req = makeRequest();
      await expect(requireAuth(req)).rejects.toThrow('Missing authentication token');
    });
  });

  describe('invalid or expired token', () => {
    test('throws AuthError 401 when jwtVerify rejects', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('JWTExpired'));

      const req = makeRequest({ authHeader: 'Bearer expired.token' });
      await expect(requireAuth(req)).rejects.toMatchObject({
        status: 401,
        message: 'Invalid or expired token',
      });
    });

    test('throws AuthError on tampered signature', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('JWSSignatureVerificationFailed'));

      const req = makeRequest({ authHeader: 'Bearer tampered.token' });
      await expect(requireAuth(req)).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('JWKS caching', () => {
    test('getJwks is called with correct userPoolId and region', async () => {
      mockJwtVerify.mockResolvedValueOnce({ payload: { sub: 'u1' } });

      const req = makeRequest({ authHeader: 'Bearer some.token' });
      await requireAuth(req);

      expect(mockGetJwks).toHaveBeenCalledWith('us-east-1_TestPool', 'us-east-1');
    });

    test('getJwks is called on every requireAuth call (caching is inside getJwks)', async () => {
      mockJwtVerify.mockResolvedValue({ payload: { sub: 'u1' } });

      const req1 = makeRequest({ authHeader: 'Bearer token1' });
      const req2 = makeRequest({ authHeader: 'Bearer token2' });
      await requireAuth(req1);
      await requireAuth(req2);

      expect(mockGetJwks).toHaveBeenCalledTimes(2);
    });
  });

  describe('server misconfiguration', () => {
    test('throws AuthError 500 when COGNITO_USER_POOL_ID is missing', async () => {
      delete process.env.COGNITO_USER_POOL_ID;

      const req = makeRequest({ authHeader: 'Bearer some.token' });
      await expect(requireAuth(req)).rejects.toMatchObject({ status: 500 });
    });
  });
});
