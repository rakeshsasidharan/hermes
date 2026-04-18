import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwks } from '@/lib/auth/jwks-cache';
import { refreshAccessToken, CognitoAuthError } from '@/lib/auth/cognito';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@/lib/auth/cookies';

const PUBLIC_PATHS = ['/login', '/api/auth/signout'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const region = process.env.AWS_REGION ?? 'us-east-1';

  if (!userPoolId) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

  if (accessToken) {
    try {
      const jwks = getJwks(userPoolId, region);
      await jwtVerify(accessToken, jwks, { issuer });
      return NextResponse.next();
    } catch {
      // Access token invalid or expired — try refresh below
    }
  }

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    const response = NextResponse.next();
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expiresIn,
    });

    return response;
  } catch (err) {
    if (err instanceof CognitoAuthError) {
      const loginUrl = new URL('/login', req.url);
      const resp = NextResponse.redirect(loginUrl);
      resp.cookies.set(ACCESS_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
      resp.cookies.set(REFRESH_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
      return resp;
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
