import { NextRequest, NextResponse } from 'next/server';
import {
  SESClient,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
} from '@aws-sdk/client-ses';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

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
  const { domain } = body as { domain?: string };

  if (!domain || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Invalid domain name' }, { status: 400 });
  }

  const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

  const [verifyResult, dkimResult] = await Promise.all([
    ses.send(new VerifyDomainIdentityCommand({ Domain: domain })),
    ses.send(new VerifyDomainDkimCommand({ Domain: domain })),
  ]);

  return NextResponse.json({
    domain,
    verificationToken: verifyResult.VerificationToken,
    dkimTokens: dkimResult.DkimTokens ?? [],
  });
}
