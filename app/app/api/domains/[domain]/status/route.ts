import { NextRequest, NextResponse } from 'next/server';
import {
  SESClient,
  GetIdentityVerificationAttributesCommand,
  GetIdentityDkimAttributesCommand,
} from '@aws-sdk/client-ses';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domain: string }> },
) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { domain } = await params;
  const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

  const [verifyAttrs, dkimAttrs] = await Promise.all([
    ses.send(new GetIdentityVerificationAttributesCommand({ Identities: [domain] })),
    ses.send(new GetIdentityDkimAttributesCommand({ Identities: [domain] })),
  ]);

  const verifyStatus =
    verifyAttrs.VerificationAttributes?.[domain]?.VerificationStatus ?? 'Pending';
  const dkimStatus =
    dkimAttrs.DkimAttributes?.[domain]?.DkimVerificationStatus ?? 'Pending';

  function normalise(s: string): 'Verified' | 'Pending' | 'Failed' {
    if (s === 'Success') return 'Verified';
    if (s === 'Failed' || s === 'TemporaryFailure') return 'Failed';
    return 'Pending';
  }

  return NextResponse.json({
    domain,
    ses: normalise(verifyStatus),
    dkim: normalise(dkimStatus),
  });
}
