/**
 * @jest-environment node
 */
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  test('returns 200 with ok status', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });
});
