import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const key = `hmrs_${raw}`;
  const prefix = `${key.slice(0, 13)}...`;
  const keyHash = hashKey(key);
  return { key, prefix, keyHash };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { email } = await params;
  const address = decodeURIComponent(email).toLowerCase();
  const dynamo = getDynamo();

  const result = await dynamo.send(new QueryCommand({
    TableName: process.env.API_KEYS_TABLE!,
    IndexName: 'address-createdAt-index',
    KeyConditionExpression: 'address = :address',
    ExpressionAttributeValues: { ':address': address },
    ScanIndexForward: false,
  }));

  const keys = (result.Items ?? []).map(({ keyHash: _kh, ...rest }) => rest);
  return NextResponse.json({ keys });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { email } = await params;
  const address = decodeURIComponent(email).toLowerCase();
  const dynamo = getDynamo();

  const existing = await dynamo.send(new GetCommand({
    TableName: process.env.ADDRESSES_TABLE!,
    Key: { email: address },
  }));
  if (!existing.Item || existing.Item.status === 'deleted') {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 });
  }

  let label: string | undefined;
  try {
    const body = await req.json();
    label = body?.label?.trim() || undefined;
  } catch {
    // label is optional — ignore parse error
  }

  const { key, prefix, keyHash } = generateApiKey();
  const keyId = crypto.randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(new PutCommand({
    TableName: process.env.API_KEYS_TABLE!,
    Item: {
      keyHash,
      keyId,
      address,
      prefix,
      createdAt: now,
      ...(label ? { label } : {}),
    },
  }));

  return NextResponse.json({ key, keyId, prefix, address, createdAt: now, label }, { status: 201 });
}
