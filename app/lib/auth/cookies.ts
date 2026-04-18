import { type NextResponse, type NextRequest } from 'next/server';
import { type AuthTokens } from './cognito';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

const SECURE = process.env.NODE_ENV === 'production';

export function setAuthCookies(response: NextResponse, tokens: AuthTokens): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expiresIn,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function getAccessToken(req: NextRequest): string | undefined {
  return req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
}

export function getRefreshToken(req: NextRequest): string | undefined {
  return req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
}
