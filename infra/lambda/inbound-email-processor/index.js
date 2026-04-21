'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const { simpleParser } = require('mailparser');

const MESSAGES_TABLE = process.env.MESSAGES_TABLE;
const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE;
const S3_BUCKET = process.env.S3_BUCKET;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT;

exports.handler = async (event) => {
  // EventBridge S3 event: detail.object.key may be URL-encoded
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));
  // key format: inbound/<address>/<messageId>
  const parts = key.split('/');
  const address = parts[1];
  const messageId = parts[2];

  const s3 = new S3Client({});
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const getResult = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const rawEmail = await getResult.Body.transformToString();

  let parsed;
  try {
    parsed = await simpleParser(rawEmail);
  } catch (err) {
    console.error('Failed to parse MIME email', { messageId, error: err.message });
    return;
  }

  const receivedAt = new Date().toISOString();
  const puts = [];

  if (parsed.text) {
    puts.push(s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `parsed/${messageId}/body.txt`,
      Body: parsed.text,
      ContentType: 'text/plain',
    })));
  }

  if (parsed.html) {
    puts.push(s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `parsed/${messageId}/body.html`,
      Body: parsed.html,
      ContentType: 'text/html',
    })));
  }

  const attachmentKeys = [];
  for (const attachment of (parsed.attachments || [])) {
    const attachKey = `attachments/${messageId}/${attachment.filename}`;
    puts.push(s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: attachKey,
      Body: attachment.content,
      ContentType: attachment.contentType,
    })));
    attachmentKeys.push(attachKey);
  }

  await Promise.all(puts);

  await dynamo.send(new PutCommand({
    TableName: MESSAGES_TABLE,
    Item: {
      messageId,
      address,
      direction: 'inbound',
      subject: parsed.subject || '',
      from: parsed.from?.text || '',
      to: parsed.to?.text || '',
      receivedAt,
      bodyTextS3Key: parsed.text ? `parsed/${messageId}/body.txt` : undefined,
      bodyHtmlS3Key: parsed.html ? `parsed/${messageId}/body.html` : undefined,
      attachments: attachmentKeys,
      isRead: false,
    },
  }));

  const connectionsResult = await dynamo.send(new ScanCommand({ TableName: WS_CONNECTIONS_TABLE }));
  const connections = connectionsResult.Items || [];

  if (connections.length === 0) return;

  const wsClient = new ApiGatewayManagementApiClient({ endpoint: WEBSOCKET_API_ENDPOINT });
  const payload = Buffer.from(JSON.stringify({ type: 'new_message', address, messageId }));

  await Promise.all(connections.map(async (conn) => {
    try {
      await wsClient.send(new PostToConnectionCommand({
        ConnectionId: conn.connectionId,
        Data: payload,
      }));
    } catch (err) {
      if (err.name === 'GoneException' || err.$metadata?.httpStatusCode === 410) {
        await dynamo.send(new DeleteCommand({
          TableName: WS_CONNECTIONS_TABLE,
          Key: { connectionId: conn.connectionId },
        }));
      } else {
        console.error('Failed to send WebSocket notification', {
          connectionId: conn.connectionId,
          error: err.message,
        });
      }
    }
  }));
};
