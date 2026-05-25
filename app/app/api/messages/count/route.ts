import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

async function countQuery(
  dynamo: DynamoDBDocumentClient,
  address: string,
  filterExpression: string,
  expressionAttributeValues: Record<string, unknown>,
): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: process.env.MESSAGES_TABLE!,
      IndexName: 'address-receivedAt-index',
      KeyConditionExpression: '#address = :addr',
      FilterExpression: filterExpression,
      ExpressionAttributeNames: { '#address': 'address' },
      ExpressionAttributeValues: { ':addr': address, ...expressionAttributeValues },
      Select: 'COUNT',
      ...(lastKey && { ExclusiveStartKey: lastKey }),
    }));

    total += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return total;
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

  const address = req.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address query parameter is required' }, { status: 400 });
  }

  const dynamo = getDynamo();

  const [total, unread] = await Promise.all([
    countQuery(dynamo, address, 'direction = :inbound', { ':inbound': 'inbound' }),
    countQuery(dynamo, address, 'direction = :inbound AND isRead = :false', { ':inbound': 'inbound', ':false': false }),
  ]);

  return NextResponse.json({ total, unread });
}
