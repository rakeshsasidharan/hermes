import { NextRequest, NextResponse } from 'next/server';
import { changePassword, CognitoAuthError } from '@/lib/auth/cognito';
import { requireAuth } from '@/lib/auth/require-auth';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword are required' }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  try {
    await changePassword(accessToken, currentPassword, newPassword);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof CognitoAuthError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
