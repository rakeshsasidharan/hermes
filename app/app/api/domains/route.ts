import { NextRequest, NextResponse } from 'next/server';
import { SESClient, ListIdentitiesCommand } from '@aws-sdk/client-ses';
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
  const result = await ses.send(new ListIdentitiesCommand({ IdentityType: 'Domain' }));
  return NextResponse.json({ domains: result.Identities ?? [] });
}
