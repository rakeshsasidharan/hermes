'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const JWKS_CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getJwks(userPoolId, region) {
  const jwksUri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const cached = JWKS_CACHE.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.jwks;
  }
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  JWKS_CACHE.set(jwksUri, { jwks, fetchedAt: Date.now() });
  return jwks;
}

exports.clearJwksCache = () => JWKS_CACHE.clear();

exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;

  if (!token) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let userId;
  try {
    const issuer = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
    const jwks = getJwks(COGNITO_USER_POOL_ID, AWS_REGION);
    const { payload } = await jwtVerify(token, jwks, { issuer });
    userId = payload.sub;
  } catch {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const connectionId = event.requestContext.connectionId;
  const connectedAt = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 7200;

  await dynamo.send(new PutCommand({
    TableName: WS_CONNECTIONS_TABLE,
    Item: { connectionId, userId, connectedAt, ttl },
  }));

  return { statusCode: 200 };
};
