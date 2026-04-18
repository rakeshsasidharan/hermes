'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn, CognitoAuthError } from '@/lib/auth/cognito';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/cookies';

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  try {
    const tokens = await signIn(username, password);
    const cookieStore = await cookies();

    const isProduction = process.env.NODE_ENV === 'production';

    cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expiresIn,
    });

    cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
  } catch (err) {
    if (err instanceof CognitoAuthError) {
      return { error: 'Invalid username or password.' };
    }
    return { error: 'An unexpected error occurred. Please try again.' };
  }

  redirect('/');
}
