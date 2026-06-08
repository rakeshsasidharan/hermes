import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

function getSESv2() {
  return new SESv2Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

function getS3() {
  return new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function resolveApiKey(
  dynamo: DynamoDBDocumentClient,
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith('hmrs_')) return null;

  const keyHash = hashKey(rawKey);
  const result = await dynamo.send(new GetCommand({
    TableName: process.env.API_KEYS_TABLE!,
    Key: { keyHash },
  }));
  if (!result.Item) return null;
  return result.Item.address as string;
}

export async function POST(req: NextRequest) {
  const dynamo = getDynamo();

  const authorizedAddress = await resolveApiKey(dynamo, req.headers.get('Authorization'));
  if (!authorizedAddress) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { from, to, subject, body: emailBody, replyTo } = payload;

  if (!from || !to || !subject || !emailBody) {
    return NextResponse.json({ error: 'from, to, subject, and body are required' }, { status: 400 });
  }

  if ((from as string).toLowerCase() !== authorizedAddress) {
    return NextResponse.json({ error: 'API key is not authorized to send from this address' }, { status: 403 });
  }

  const toAddresses = Array.isArray(to) ? (to as string[]) : [(to as string)];
  const bodyPayload = emailBody as { text?: string; html?: string } | string;
  const bodyText = typeof bodyPayload === 'string' ? bodyPayload : (bodyPayload.text ?? '');
  const bodyHtml = typeof bodyPayload === 'object' ? bodyPayload.html : undefined;

  const ses = getSESv2();
  const sesResult = await ses.send(new SendEmailCommand({
    FromEmailAddress: from as string,
    Destination: { ToAddresses: toAddresses },
    ReplyToAddresses: replyTo ? [(replyTo as string)] : undefined,
    Content: {
      Simple: {
        Subject: { Data: subject as string, Charset: 'UTF-8' },
        Body: {
          ...(bodyText ? { Text: { Data: bodyText, Charset: 'UTF-8' } } : {}),
          ...(bodyHtml ? { Html: { Data: bodyHtml, Charset: 'UTF-8' } } : {}),
        },
      },
    },
  }));

  const messageId = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  const bodyS3Key = `sent/${messageId}/body.txt`;
  await getS3().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: bodyS3Key,
    Body: bodyText,
    ContentType: 'text/plain',
  }));

  await dynamo.send(new PutCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Item: {
      messageId,
      address: from as string,
      direction: 'outbound',
      from: from as string,
      to: toAddresses.join(', '),
      subject: subject as string,
      receivedAt: sentAt,
      isRead: true,
      bodyTextS3Key: bodyS3Key,
      snippet: bodyText.replace(/\s+/g, ' ').trim().slice(0, 300) || undefined,
      source: 'api',
    },
  }));

  return NextResponse.json({ messageId, sesMessageId: sesResult.MessageId }, { status: 201 });
}
