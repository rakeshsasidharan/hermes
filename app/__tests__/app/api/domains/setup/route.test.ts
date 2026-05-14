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
const mockR53Send = jest.fn();

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  GetIdentityVerificationAttributesCommand: jest.fn((p: unknown) => ({
    _type: 'get-attrs',
    ...((p as object) ?? {}),
  })),
  VerifyDomainIdentityCommand: jest.fn((p: unknown) => ({
    _type: 'verify-identity',
    ...((p as object) ?? {}),
  })),
  VerifyDomainDkimCommand: jest.fn((p: unknown) => ({
    _type: 'verify-dkim',
    ...((p as object) ?? {}),
  })),
}));

jest.mock('@aws-sdk/client-route-53', () => ({
  Route53Client: jest.fn().mockImplementation(() => ({ send: mockR53Send })),
  ListHostedZonesByNameCommand: jest.fn((p: unknown) => ({
    _type: 'list-zones',
    ...((p as object) ?? {}),
  })),
  ChangeResourceRecordSetsCommand: jest.fn((p: unknown) => ({
    _type: 'change-records',
    ...((p as object) ?? {}),
  })),
  ChangeAction: { CREATE: 'CREATE' },
  RRType: { CNAME: 'CNAME', MX: 'MX', TXT: 'TXT' },
}));

import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import { POST } from '@/app/api/domains/setup/route';

const mockRequireAuth = requireAuth as jest.Mock;

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/domains/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockZoneFound(domain = 'example.com', zoneId = '/hostedzone/Z123') {
  mockR53Send.mockResolvedValueOnce({
    HostedZones: [{ Id: zoneId, Name: `${domain}.` }],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/domains/setup', () => {
  test('returns 401 for unauthenticated request', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError('Missing authentication token', 401));

    const res = await POST(makeReq({ domain: 'example.com' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Missing authentication token');
    expect(mockSesSend).not.toHaveBeenCalled();
    expect(mockR53Send).not.toHaveBeenCalled();
  });

  test('returns 400 for missing domain', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await POST(makeReq({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid domain name');
  });

  test('returns 400 for invalid domain', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    const res = await POST(makeReq({ domain: 'not_a_domain' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid domain name');
  });

  test('returns 422 when no hosted zone found for domain', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockR53Send.mockResolvedValueOnce({ HostedZones: [] });

    const res = await POST(makeReq({ domain: 'example.com' }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/not hosted in Route 53/);
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  test('returns 409 when domain is already verified in SES', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });
    mockZoneFound();
    mockSesSend.mockResolvedValueOnce({
      VerificationAttributes: { 'example.com': { VerificationStatus: 'Success' } },
    });

    const res = await POST(makeReq({ domain: 'example.com' }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('Domain is already verified in SES');
  });

  test('happy path: creates DNS records and returns pending status', async () => {
    mockRequireAuth.mockResolvedValue({ sub: 'user-1' });

    // Route 53 — zone found
    mockZoneFound();
    // SES — domain not yet registered
    mockSesSend.mockResolvedValueOnce({ VerificationAttributes: {} });
    // VerifyDomainIdentityCommand + VerifyDomainDkimCommand (called in parallel)
    mockSesSend.mockResolvedValueOnce({ VerificationToken: 'token-abc' });
    mockSesSend.mockResolvedValueOnce({ DkimTokens: ['tok1', 'tok2', 'tok3'] });
    // ChangeResourceRecordSetsCommand
    mockR53Send.mockResolvedValueOnce({
      ChangeInfo: { Id: '/change/C456', Status: 'PENDING' },
    });

    const res = await POST(makeReq({ domain: 'example.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ domain: 'example.com', status: 'pending', changeId: '/change/C456' });

    // Verify Route 53 received 5 changes: 1 TXT + 3 CNAME + 1 MX
    const r53Call = mockR53Send.mock.calls[1][0];
    expect(r53Call.ChangeBatch.Changes).toHaveLength(5);
    const types = r53Call.ChangeBatch.Changes.map(
      (c: { ResourceRecordSet: { Type: string } }) => c.ResourceRecordSet.Type,
    );
    expect(types.filter((t: string) => t === 'TXT')).toHaveLength(1);
    expect(types.filter((t: string) => t === 'CNAME')).toHaveLength(3);
    expect(types.filter((t: string) => t === 'MX')).toHaveLength(1);

    // Verify TXT record has correct name and quoted token value
    const txtRecord = r53Call.ChangeBatch.Changes.find(
      (c: { ResourceRecordSet: { Type: string } }) => c.ResourceRecordSet.Type === 'TXT',
    );
    expect(txtRecord.ResourceRecordSet.Name).toBe('_amazonses.example.com');
    expect(txtRecord.ResourceRecordSet.ResourceRecords[0].Value).toBe('"token-abc"');
  });
});
