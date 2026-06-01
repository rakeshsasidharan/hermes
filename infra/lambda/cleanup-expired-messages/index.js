'use strict';

const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const MESSAGES_TABLE = process.env.MESSAGES_TABLE;
const S3_BUCKET = process.env.S3_BUCKET;
const EXPIRY_DAYS = 30;

function getClients() {
  const s3 = new S3Client({});
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return { s3, dynamo };
}

function cutoff() {
  const d = new Date();
  d.setDate(d.getDate() - EXPIRY_DAYS);
  return d.toISOString();
}

async function deleteS3Keys(s3, keys) {
  await Promise.all(
    keys.filter(Boolean).map((key) =>
      s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })),
    ),
  );
}

exports.handler = async () => {
  const { s3, dynamo } = getClients();
  const threshold = cutoff();

  let junkMoved = 0;
  let trashDeleted = 0;

  // Scan all messages once; partition by folder
  let lastKey;
  const junkExpired = [];
  const trashExpired = [];

  do {
    const result = await dynamo.send(new ScanCommand({
      TableName: MESSAGES_TABLE,
      ExclusiveStartKey: lastKey,
      FilterExpression: '#f IN (:junk, :trash)',
      ExpressionAttributeNames: { '#f': 'folder' },
      ExpressionAttributeValues: { ':junk': 'junk', ':trash': 'trash' },
      ProjectionExpression: 'messageId, #f, folderMovedAt, bodyTextS3Key, bodyHtmlS3Key, attachments',
    }));

    for (const item of result.Items ?? []) {
      const movedAt = item.folderMovedAt;
      if (!movedAt || movedAt > threshold) continue;

      if (item.folder === 'junk') junkExpired.push(item);
      else if (item.folder === 'trash') trashExpired.push(item);
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // Junk → Trash
  await Promise.all(junkExpired.map(async (item) => {
    const now = new Date().toISOString();
    await dynamo.send(new UpdateCommand({
      TableName: MESSAGES_TABLE,
      Key: { messageId: item.messageId },
      UpdateExpression: 'SET #f = :trash, folderMovedAt = :now, updatedAt = :now',
      ExpressionAttributeNames: { '#f': 'folder' },
      ExpressionAttributeValues: { ':trash': 'trash', ':now': now },
    }));
    junkMoved++;
  }));

  // Trash → Delete (DynamoDB + S3)
  await Promise.all(trashExpired.map(async (item) => {
    await dynamo.send(new DeleteCommand({
      TableName: MESSAGES_TABLE,
      Key: { messageId: item.messageId },
    }));

    const s3Keys = [
      item.bodyTextS3Key,
      item.bodyHtmlS3Key,
      ...(Array.isArray(item.attachments) ? item.attachments : []),
    ];
    await deleteS3Keys(s3, s3Keys);
    trashDeleted++;
  }));

  console.log(JSON.stringify({ junkMoved, trashDeleted }));
  return { junkMoved, trashDeleted };
};
