/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/require-auth', () => ({
  requireAuth: jest.fn(),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(msg: string, status = 401) {
      super(msg);
      this.status = status;
    }
  },
}));

const mockSesSend = jest.fn();

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  GetIdentityVerificationAttributesCommand: jest.fn((p: unknown) => ({
    _type: 'get-verify-attrs',
    ...((p as object) ?? {}),
  })),
  GetIdentityDkimAttributesCommand: jest.fn((p: unknown) => ({
    _type: 'get-dkim-attrs',
    ...((p as object) ?? {}),
  })),
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import { GET } from '@/app/api/domains/[domain]/status/route';

const mockRequireAuth = requireAuth as jest.Mock;

function makeReq(domain: string) {
  return new NextRequest(`http://localhost/api/domains/${domain}/status`);
}

function makeParams(domain: string) {
  return { params: Promise.resolve({ domain }) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/domains/:domain/status', () => {
  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await GET(makeReq('example.com'), makeParams('example.com'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Missing authentication token');
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  test('returns combined SES and DKIM Verified status', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockSesSend
      .mockResolvedValueOnce({
        VerificationAttributes: { 'example.com': { VerificationStatus: 'Success' } },
      })
      .mockResolvedValueOnce({
        DkimAttributes: { 'example.com': { DkimVerificationStatus: 'Success' } },
      });

    const res = await GET(makeReq('example.com'), makeParams('example.com'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ domain: 'example.com', ses: 'Verified', dkim: 'Verified' });
  });

  test('returns Pending when both SES and DKIM are pending', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockSesSend
      .mockResolvedValueOnce({
        VerificationAttributes: { 'example.com': { VerificationStatus: 'Pending' } },
      })
      .mockResolvedValueOnce({
        DkimAttributes: { 'example.com': { DkimVerificationStatus: 'Pending' } },
      });

    const res = await GET(makeReq('example.com'), makeParams('example.com'));
    const body = await res.json();

    expect(body).toEqual({ domain: 'example.com', ses: 'Pending', dkim: 'Pending' });
  });

  test('returns Failed when SES status is Failed', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockSesSend
      .mockResolvedValueOnce({
        VerificationAttributes: { 'example.com': { VerificationStatus: 'Failed' } },
      })
      .mockResolvedValueOnce({
        DkimAttributes: { 'example.com': { DkimVerificationStatus: 'Pending' } },
      });

    const res = await GET(makeReq('example.com'), makeParams('example.com'));
    const body = await res.json();

    expect(body.ses).toBe('Failed');
    expect(body.dkim).toBe('Pending');
  });

  test('maps TemporaryFailure to Failed', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockSesSend
      .mockResolvedValueOnce({
        VerificationAttributes: {
          'example.com': { VerificationStatus: 'TemporaryFailure' },
        },
      })
      .mockResolvedValueOnce({
        DkimAttributes: {
          'example.com': { DkimVerificationStatus: 'TemporaryFailure' },
        },
      });

    const res = await GET(makeReq('example.com'), makeParams('example.com'));
    const body = await res.json();

    expect(body.ses).toBe('Failed');
    expect(body.dkim).toBe('Failed');
  });

  test('returns Pending when domain not found in SES response', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockSesSend
      .mockResolvedValueOnce({ VerificationAttributes: {} })
      .mockResolvedValueOnce({ DkimAttributes: {} });

    const res = await GET(makeReq('unknown.com'), makeParams('unknown.com'));
    const body = await res.json();

    expect(body).toEqual({ domain: 'unknown.com', ses: 'Pending', dkim: 'Pending' });
  });
});
