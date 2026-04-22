import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
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

  const dynamo = getDynamo();
  const result = await dynamo.send(new ScanCommand({
    TableName: process.env.ADDRESSES_TABLE!,
    FilterExpression: '#s <> :deleted',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':deleted': 'deleted' },
  }));

  return NextResponse.json({ addresses: result.Items ?? [] });
}
