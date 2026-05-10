import { NextRequest, NextResponse } from 'next/server';
import {
  SESClient,
  ListIdentitiesCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const listResult = await ses.send(new ListIdentitiesCommand({ IdentityType: 'Domain' }));
  const identities = listResult.Identities ?? [];

  if (identities.length === 0) {
    return NextResponse.json({ domains: [] });
  }

  const attrsResult = await ses.send(
    new GetIdentityVerificationAttributesCommand({ Identities: identities }),
  );

  const domains = identities.map((domain) => {
    const raw =
      attrsResult.VerificationAttributes?.[domain]?.VerificationStatus ?? 'Pending';
    let status: 'Verified' | 'Pending' | 'Failed';
    if (raw === 'Success') status = 'Verified';
    else if (raw === 'Failed' || raw === 'TemporaryFailure') status = 'Failed';
    else status = 'Pending';
    return { domain, status };
  });

  return NextResponse.json({ domains });
}
