import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  type InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export class CognitoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CognitoAuthError';
  }
}

export async function signIn(username: string, password: string): Promise<AuthTokens> {
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!clientId) {
    throw new CognitoAuthError('Server misconfiguration: COGNITO_CLIENT_ID not set');
  }

  let result: InitiateAuthCommandOutput;
  try {
    result = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      }),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    throw new CognitoAuthError(message);
  }

  const auth = result.AuthenticationResult;
  if (!auth?.AccessToken || !auth.RefreshToken || !auth.IdToken) {
    throw new CognitoAuthError('Incomplete authentication result from Cognito');
  }

  return {
    accessToken: auth.AccessToken,
    refreshToken: auth.RefreshToken,
    idToken: auth.IdToken,
    expiresIn: auth.ExpiresIn ?? 3600,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!clientId) {
    throw new CognitoAuthError('Server misconfiguration: COGNITO_CLIENT_ID not set');
  }

  let result: InitiateAuthCommandOutput;
  try {
    result = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      }),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Token refresh failed';
    throw new CognitoAuthError(message);
  }

  const auth = result.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken) {
    throw new CognitoAuthError('Incomplete token refresh result from Cognito');
  }

  return {
    accessToken: auth.AccessToken,
    refreshToken,
    idToken: auth.IdToken,
    expiresIn: auth.ExpiresIn ?? 3600,
  };
}
