/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/token/route';

function makeRequest(cookieHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/token', {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

describe('GET /api/auth/token', () => {
  test('returns the access token from the cookie', async () => {
    const req = makeRequest('access_token=my-jwt-token');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ token: 'my-jwt-token' });
  });

  test('returns 401 when no access_token cookie is present', async () => {
    const req = makeRequest();
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'No token' });
  });
});
