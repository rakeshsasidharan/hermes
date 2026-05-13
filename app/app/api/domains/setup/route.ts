import { NextRequest, NextResponse } from 'next/server';
import {
  SESClient,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
  ChangeAction,
  RRType,
} from '@aws-sdk/client-route-53';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

const FQDN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const domain = ((body as { domain?: string })?.domain ?? '').trim().toLowerCase();

  if (!domain || !FQDN_RE.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain name' }, { status: 400 });
  }

  const region = process.env.AWS_REGION ?? 'us-east-1';
  const ses = new SESClient({ region });
  const r53 = new Route53Client({ region });

  try {
    // Verify Route 53 hosted zone exists for this domain BEFORE touching SES,
    // so we never leave a dangling SES identity if the zone is missing.
    const zonesResult = await r53.send(
      new ListHostedZonesByNameCommand({ DNSName: domain, MaxItems: 1 }),
    );
    const zone = zonesResult.HostedZones?.[0];
    const zoneName = zone?.Name?.replace(/\.$/, '') ?? '';
    if (!zone?.Id || !(domain === zoneName || domain.endsWith(`.${zoneName}`))) {
      return NextResponse.json(
        {
          error: `${domain} is not hosted in Route 53. To use this domain with Hermes, add it as a hosted zone in Route 53 first.`,
        },
        { status: 422 },
      );
    }
    const zoneId = zone.Id.replace(/^\/hostedzone\//, '');

    // Reject if domain is already active in SES
    const attrsResult = await ses.send(
      new GetIdentityVerificationAttributesCommand({ Identities: [domain] }),
    );
    if (attrsResult.VerificationAttributes?.[domain]?.VerificationStatus === 'Success') {
      return NextResponse.json({ error: 'Domain is already verified in SES' }, { status: 409 });
    }

    // Register domain with SES and obtain verification token + DKIM tokens
    const [identityResult, dkimResult] = await Promise.all([
      ses.send(new VerifyDomainIdentityCommand({ Domain: domain })),
      ses.send(new VerifyDomainDkimCommand({ Domain: domain })),
    ]);
    const verificationToken = identityResult.VerificationToken;
    const dkimTokens = dkimResult.DkimTokens ?? [];

    // Create domain verification TXT record, DKIM CNAME records, and MX record via Route 53
    const changes = [
      ...(verificationToken
        ? [
            {
              Action: ChangeAction.CREATE,
              ResourceRecordSet: {
                Name: `_amazonses.${domain}`,
                Type: RRType.TXT,
                TTL: 1800,
                ResourceRecords: [{ Value: `"${verificationToken}"` }],
              },
            },
          ]
        : []),
      ...dkimTokens.map((token) => ({
        Action: ChangeAction.CREATE,
        ResourceRecordSet: {
          Name: `${token}._domainkey.${domain}`,
          Type: RRType.CNAME,
          TTL: 1800,
          ResourceRecords: [{ Value: `${token}.dkim.amazonses.com` }],
        },
      })),
      {
        Action: ChangeAction.CREATE,
        ResourceRecordSet: {
          Name: `${domain}.`,
          Type: RRType.MX,
          TTL: 300,
          ResourceRecords: [{ Value: `10 inbound-smtp.${region}.amazonaws.com` }],
        },
      },
    ];

    const changeResult = await r53.send(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: zoneId,
        ChangeBatch: { Changes: changes },
      }),
    );

    return NextResponse.json({
      domain,
      status: 'pending',
      changeId: changeResult.ChangeInfo?.Id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Domain setup failed: ${message}` }, { status: 500 });
  }
}
