// Module-level mock instances — shared across all handler invocations per test
const mockDynamo = { send: jest.fn() };

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn() },
  PutCommand: jest.fn((p: unknown) => p),
}));

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

process.env.WS_CONNECTIONS_TABLE = 'hermes-ws-connections';
process.env.COGNITO_USER_POOL_ID = 'us-east-1_testPool';
process.env.AWS_REGION = 'us-east-1';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler, clearJwksCache } = require('../../lambda/ws-connect/index');

const MOCK_JWKS = {};
const VALID_TOKEN = 'valid.jwt.token';
const USER_ID = 'user-sub-123';

function makeEvent(token?: string, connectionId = 'conn-abc') {
  return {
    requestContext: { connectionId },
    queryStringParameters: token !== undefined ? { token } : undefined,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearJwksCache();
  (DynamoDBClient as jest.Mock).mockReturnValue({});
  (DynamoDBDocumentClient.from as unknown as jest.Mock).mockReturnValue(mockDynamo);
  (createRemoteJWKSet as jest.Mock).mockReturnValue(MOCK_JWKS);
  mockDynamo.send.mockResolvedValue({});
});

describe('WsConnectHandler', () => {
  describe('valid JWT', () => {
    beforeEach(() => {
      (jwtVerify as jest.Mock).mockResolvedValue({ payload: { sub: USER_ID } });
    });

    test('returns 200', async () => {
      const result = await handler(makeEvent(VALID_TOKEN));
      expect(result.statusCode).toBe(200);
    });

    test('writes connection record to DynamoDB with correct fields', async () => {
      const before = Math.floor(Date.now() / 1000);
      await handler(makeEvent(VALID_TOKEN, 'conn-xyz'));
      const after = Math.floor(Date.now() / 1000);

      expect(mockDynamo.send).toHaveBeenCalledTimes(1);
      const putArg = (mockDynamo.send.mock.calls[0] as [Record<string, unknown>])[0];
      expect(putArg).toMatchObject({
        TableName: 'hermes-ws-connections',
        Item: expect.objectContaining({
          connectionId: 'conn-xyz',
          userId: USER_ID,
        }),
      });

      const item = (putArg as any).Item;
      expect(typeof item.connectedAt).toBe('string');
      expect(item.ttl).toBeGreaterThanOrEqual(before + 7200);
      expect(item.ttl).toBeLessThanOrEqual(after + 7200);
    });

    test('TTL is current epoch + 7200', async () => {
      const before = Math.floor(Date.now() / 1000);
      await handler(makeEvent(VALID_TOKEN));
      const after = Math.floor(Date.now() / 1000);

      const putArg = (mockDynamo.send.mock.calls[0] as [Record<string, unknown>])[0];
      const item = (putArg as any).Item;
      expect(item.ttl).toBeGreaterThanOrEqual(before + 7200);
      expect(item.ttl).toBeLessThanOrEqual(after + 7200);
    });

    test('verifies JWT against correct Cognito issuer', async () => {
      await handler(makeEvent(VALID_TOKEN));
      expect(jwtVerify).toHaveBeenCalledWith(
        VALID_TOKEN,
        MOCK_JWKS,
        { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPool' },
      );
    });

    test('creates JWKS from correct user pool URL', async () => {
      await handler(makeEvent(VALID_TOKEN));
      expect(createRemoteJWKSet).toHaveBeenCalledWith(
        new URL('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPool/.well-known/jwks.json'),
      );
    });
  });

  describe('missing token', () => {
    test('returns 401 when token query param is absent', async () => {
      const result = await handler(makeEvent(undefined));
      expect(result.statusCode).toBe(401);
    });

    test('does not write to DynamoDB when token is absent', async () => {
      await handler(makeEvent(undefined));
      expect(mockDynamo.send).not.toHaveBeenCalled();
    });
  });

  describe('invalid JWT', () => {
    beforeEach(() => {
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('JWTExpired'));
    });

    test('returns 401 when jwtVerify throws', async () => {
      const result = await handler(makeEvent('bad.token.here'));
      expect(result.statusCode).toBe(401);
    });

    test('does not write to DynamoDB when JWT is invalid', async () => {
      await handler(makeEvent('bad.token.here'));
      expect(mockDynamo.send).not.toHaveBeenCalled();
    });
  });

  describe('JWKS caching', () => {
    test('reuses JWKS instance on second call within TTL', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({ payload: { sub: USER_ID } });
      await handler(makeEvent(VALID_TOKEN));
      await handler(makeEvent(VALID_TOKEN));
      // createRemoteJWKSet is called once; second call uses cache
      expect(createRemoteJWKSet).toHaveBeenCalledTimes(1);
    });
  });
});
