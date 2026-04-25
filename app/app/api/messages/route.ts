import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
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

  const filterConditions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {
    ':address': address,
  };

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

  return NextResponse.json({ items: result.Items ?? [], nextCursor });
}
