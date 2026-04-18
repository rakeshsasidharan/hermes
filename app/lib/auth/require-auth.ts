import { jwtVerify, type JWTPayload } from 'jose';
import { type NextRequest } from 'next/server';
import { getJwks } from './jwks-cache';

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export interface CognitoClaims extends JWTPayload {
  'cognito:username'?: string;
  email?: string;
  token_use?: string;
}

export async function requireAuth(req: NextRequest): Promise<CognitoClaims> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const region = process.env.AWS_REGION ?? 'us-east-1';

  if (!userPoolId) {
    throw new AuthError('Server misconfiguration: COGNITO_USER_POOL_ID not set', 500);
  }

  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const cookie = req.cookies.get('access_token');
    token = cookie?.value;
  }

  if (!token) {
    throw new AuthError('Missing authentication token');
  }

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const jwks = getJwks(userPoolId, region);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
    });

    return payload as CognitoClaims;
  } catch {
    throw new AuthError('Invalid or expired token');
  }
}
