import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ email: string; keyId: string }> },
) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { email, keyId } = await params;
  const address = decodeURIComponent(email).toLowerCase();
  const dynamo = getDynamo();

  // Query the address GSI to find the keyHash for this keyId
  const result = await dynamo.send(new QueryCommand({
    TableName: process.env.API_KEYS_TABLE!,
    IndexName: 'address-createdAt-index',
    KeyConditionExpression: 'address = :address',
    FilterExpression: 'keyId = :keyId',
    ExpressionAttributeValues: { ':address': address, ':keyId': keyId },
    Limit: 10,
  }));

  const item = result.Items?.[0];
  if (!item) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 });
  }

  await dynamo.send(new DeleteCommand({
    TableName: process.env.API_KEYS_TABLE!,
    Key: { keyHash: item.keyHash },
  }));

  return new NextResponse(null, { status: 204 });
}
