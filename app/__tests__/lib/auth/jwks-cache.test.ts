import { getJwks, clearJwksCache } from '@/lib/auth/jwks-cache';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn((url: URL) => ({ _url: url.toString() })),
}));

import { createRemoteJWKSet } from 'jose';
const mockCreate = createRemoteJWKSet as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  clearJwksCache();
});

describe('getJwks', () => {
  test('creates a new JWKS for a given user pool', () => {
    getJwks('us-east-1_TestPool', 'us-east-1');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      new URL('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool/.well-known/jwks.json'),
    );
  });

  test('returns cached JWKS on second call without fetching again', () => {
    const first = getJwks('us-east-1_TestPool', 'us-east-1');
    const second = getJwks('us-east-1_TestPool', 'us-east-1');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  test('creates separate JWKS for different user pools', () => {
    getJwks('us-east-1_Pool1', 'us-east-1');
    getJwks('us-east-1_Pool2', 'us-east-1');

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  test('re-fetches after cache TTL expires', () => {
    jest.useFakeTimers();

    getJwks('us-east-1_TestPool', 'us-east-1');
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Advance past the 10-minute TTL
    jest.advanceTimersByTime(11 * 60 * 1000);

    getJwks('us-east-1_TestPool', 'us-east-1');
    expect(mockCreate).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test('does NOT re-fetch before TTL expires', () => {
    jest.useFakeTimers();

    getJwks('us-east-1_TestPool', 'us-east-1');
    jest.advanceTimersByTime(9 * 60 * 1000);
    getJwks('us-east-1_TestPool', 'us-east-1');

    expect(mockCreate).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
