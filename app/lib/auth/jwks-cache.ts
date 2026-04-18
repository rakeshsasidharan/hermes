import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

const JWKS_CACHE: Map<string, { jwks: JWTVerifyGetKey; fetchedAt: number }> = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getJwks(userPoolId: string, region: string): JWTVerifyGetKey {
  const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const cached = JWKS_CACHE.get(jwksUri);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.jwks;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  JWKS_CACHE.set(jwksUri, { jwks, fetchedAt: Date.now() });
  return jwks;
}

export function clearJwksCache(): void {
  JWKS_CACHE.clear();
}
