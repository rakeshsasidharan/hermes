import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';
import nodemailer from 'nodemailer';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

function getS3() {
  return new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

function getSES() {
  return new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { searchParams } = req.nextUrl;
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'address query parameter is required' }, { status: 400 });
  }

  const rawLimit = searchParams.get('limit');
  const limit = Math.min(rawLimit ? parseInt(rawLimit, 10) : 20, 100);

  const cursorParam = searchParams.get('cursor');
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (cursorParam) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf-8'));
    } catch {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  const sender = searchParams.get('sender');
  const subject = searchParams.get('subject');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const direction = searchParams.get('direction');

  const filterConditions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {
    ':address': address,
  };

  if (direction) {
    filterConditions.push('#direction = :direction');
    expressionAttributeNames['#direction'] = 'direction';
    expressionAttributeValues[':direction'] = direction;
  }

  if (sender) {
    filterConditions.push('contains(#sender, :sender)');
    expressionAttributeNames['#sender'] = 'sender';
    expressionAttributeValues[':sender'] = sender.toLowerCase();
  }

  if (subject) {
    filterConditions.push('contains(#subject, :subject)');
    expressionAttributeNames['#subject'] = 'subject';
    expressionAttributeValues[':subject'] = subject.toLowerCase();
  }

  if (from) {
    filterConditions.push('#receivedAt >= :from');
    expressionAttributeNames['#receivedAt'] = 'receivedAt';
    expressionAttributeValues[':from'] = from;
  }

  if (to) {
    if (!expressionAttributeNames['#receivedAt']) {
      expressionAttributeNames['#receivedAt'] = 'receivedAt';
    }
    filterConditions.push('#receivedAt <= :to');
    expressionAttributeValues[':to'] = to;
  }

  const dynamo = getDynamo();
  const result = await dynamo.send(new QueryCommand({
    TableName: process.env.MESSAGES_TABLE!,
    IndexName: 'address-receivedAt-index',
    KeyConditionExpression: '#address = :address',
    ExpressionAttributeNames: {
      '#address': 'address',
      ...expressionAttributeNames,
    },
    ExpressionAttributeValues: expressionAttributeValues,
    ...(filterConditions.length > 0 && { FilterExpression: filterConditions.join(' AND ') }),
    ScanIndexForward: false,
    Limit: limit,
    ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
  }));

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : null;

  return NextResponse.json({ messages: result.Items ?? [], nextCursor });
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { from, to, cc, bcc, subject, body: emailBody, attachmentKeys, draftId } = payload;

  if (!from || !to || !subject || emailBody === undefined || emailBody === null) {
    return NextResponse.json({ error: 'from, to, subject, and body are required' }, { status: 400 });
  }

  const s3 = getS3();
  const mimeAttachments: { filename: string; content: Buffer; contentType: string }[] = [];

  if (Array.isArray(attachmentKeys) && attachmentKeys.length > 0) {
    for (const s3Key of attachmentKeys as string[]) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: s3Key }));
      const chunks: Buffer[] = [];
      for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      mimeAttachments.push({
        filename: s3Key.split('/').pop() ?? 'attachment',
        content: Buffer.concat(chunks),
        contentType: obj.ContentType ?? 'application/octet-stream',
      });
    }
  }

  const transporter = nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
  const info = await transporter.sendMail({
    from: from as string,
    to: to as string,
    ...(cc ? { cc: cc as string } : {}),
    ...(bcc ? { bcc: bcc as string } : {}),
    subject: subject as string,
    text: emailBody as string,
    attachments: mimeAttachments,
  });

  await getSES().send(new SendRawEmailCommand({
    RawMessage: { Data: info.message as Buffer },
  }));

  const messageId = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  const bodyS3Key = `sent/${messageId}/body.txt`;
  await getS3().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: bodyS3Key,
    Body: (emailBody as string) ?? '',
    ContentType: 'text/plain',
  }));

  const dynamo = getDynamo();

  await dynamo.send(new PutCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Item: {
      messageId,
      address: from as string,
      direction: 'outbound',
      from: from as string,
      to: to as string,
      ...(cc ? { cc: cc as string } : {}),
      ...(bcc ? { bcc: bcc as string } : {}),
      subject: subject as string,
      receivedAt: sentAt,
      status: 'sent',
      isRead: true,
      bodyTextS3Key: bodyS3Key,
      ...(Array.isArray(attachmentKeys) && attachmentKeys.length > 0
        ? {
            attachments: (attachmentKeys as string[]).map((key) => ({
              s3Key: key,
              filename: key.split('/').pop() ?? 'attachment',
            })),
          }
        : {}),
    },
  }));

  if (draftId) {
    await dynamo.send(new DeleteCommand({
      TableName: process.env.DRAFTS_TABLE!,
      Key: { draftId: draftId as string },
    }));
  }

  return NextResponse.json({ messageId }, { status: 201 });
}
