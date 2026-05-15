import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { id: originalMessageId } = await params;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { from, to, cc, bcc, body: emailBody, attachmentKeys, draftId } = payload;

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }

  const dynamo = getDynamo();
  const original = await dynamo.send(new GetCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Key: { messageId: originalMessageId },
  }));

  if (!original.Item) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const originalSubject = (original.Item.subject as string) ?? '';
  const reSubject = originalSubject.toLowerCase().startsWith('re:')
    ? originalSubject
    : `Re: ${originalSubject}`;

  const inReplyToHeader = `<${originalMessageId}@hermes>`;

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
    subject: reSubject,
    text: emailBody as string ?? '',
    headers: {
      'In-Reply-To': inReplyToHeader,
      References: inReplyToHeader,
    },
    attachments: mimeAttachments,
  });

  await getSES().send(new SendRawEmailCommand({
    RawMessage: { Data: info.message as Buffer },
  }));

  const messageId = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  const bodyS3Key = `sent/${messageId}/body.txt`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: bodyS3Key,
    Body: (emailBody as string) ?? '',
    ContentType: 'text/plain',
  }));

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
      subject: reSubject,
      receivedAt: sentAt,
      inReplyTo: originalMessageId,
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
