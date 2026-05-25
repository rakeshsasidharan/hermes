import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const VALID_FOLDERS = ['inbox', 'junk', 'trash'] as const;
type Folder = typeof VALID_FOLDERS[number];
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

function getS3() {
  return new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

async function presign(s3Key: string): Promise<string> {
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: s3Key }),
    { expiresIn: 900 },
  );
}

export async function GET(
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

  const { id } = await params;
  const dynamo = getDynamo();
  const result = await dynamo.send(new GetCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Key: { messageId: id },
  }));

  if (!result.Item) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const item = { ...result.Item };

  if (item.bodyHtmlS3Key) {
    item.bodyHtmlUrl = await presign(item.bodyHtmlS3Key as string);
    delete item.bodyHtmlS3Key;
  }

  if (item.bodyTextS3Key) {
    item.bodyTextUrl = await presign(item.bodyTextS3Key as string);
    delete item.bodyTextS3Key;
  }

  if (Array.isArray(item.attachments)) {
    item.attachments = await Promise.all(
      (item.attachments as Array<Record<string, unknown>>).map(async (attachment) => {
        if (!attachment.s3Key) {
          return attachment;
        }
        const { s3Key, ...rest } = attachment;
        return { ...rest, url: await presign(s3Key as string) };
      }),
    );
  }

  return NextResponse.json({ message: item });
}

export async function PATCH(
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

  const { id } = await params;

  let isRead: unknown;
  let folder: unknown;
  try {
    const body = await req.json();
    isRead = body?.isRead;
    folder = body?.folder;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const hasIsRead = isRead !== undefined;
  const hasFolder = folder !== undefined;

  if (!hasIsRead && !hasFolder) {
    return NextResponse.json({ error: 'At least one of isRead or folder must be provided' }, { status: 400 });
  }
  if (hasIsRead && typeof isRead !== 'boolean') {
    return NextResponse.json({ error: 'isRead must be a boolean' }, { status: 400 });
  }
  if (hasFolder && !VALID_FOLDERS.includes(folder as Folder)) {
    return NextResponse.json({ error: `folder must be one of: ${VALID_FOLDERS.join(', ')}` }, { status: 400 });
  }

  const dynamo = getDynamo();

  const existing = await dynamo.send(new GetCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Key: { messageId: id },
  }));

  if (!existing.Item) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const setClauses: string[] = ['updatedAt = :now'];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = { ':now': new Date().toISOString() };

  if (hasIsRead) {
    setClauses.push('isRead = :isRead');
    expressionAttributeValues[':isRead'] = isRead;
  }

  if (hasFolder) {
    setClauses.push('#folder = :folder');
    expressionAttributeNames['#folder'] = 'folder';
    expressionAttributeValues[':folder'] = folder;
  }

  const result = await dynamo.send(new UpdateCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Key: { messageId: id },
    UpdateExpression: `SET ${setClauses.join(', ')}`,
    ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }));

  return NextResponse.json({ message: result.Attributes });
}

export async function DELETE(
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

  const { id } = await params;
  const dynamo = getDynamo();

  const existing = await dynamo.send(new GetCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Key: { messageId: id },
  }));

  if (!existing.Item) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  await dynamo.send(new DeleteCommand({
    TableName: process.env.MESSAGES_TABLE!,
    Key: { messageId: id },
  }));

  return NextResponse.json({ success: true });
}
