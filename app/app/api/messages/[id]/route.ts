import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
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

  // Replace bodyHtmlS3Key with a pre-signed bodyHtmlUrl
  if (item.bodyHtmlS3Key) {
    item.bodyHtmlUrl = await presign(item.bodyHtmlS3Key as string);
    delete item.bodyHtmlS3Key;
  }

  // Replace bodyTextS3Key with a pre-signed bodyTextUrl
  if (item.bodyTextS3Key) {
    item.bodyTextUrl = await presign(item.bodyTextS3Key as string);
    delete item.bodyTextS3Key;
  }

  // Augment each attachment with a pre-signed url (skip attachments without s3Key)
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
