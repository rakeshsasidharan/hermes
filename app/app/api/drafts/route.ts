import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

export async function GET(req: NextRequest) {
  let claims;
  try {
    claims = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const fromFilter = req.nextUrl.searchParams.get('from');

  const dynamo = getDynamo();
  const filterParts = ['userId = :userId'];
  const exprValues: Record<string, unknown> = { ':userId': claims.sub };
  const exprNames: Record<string, string> = {};

  if (fromFilter) {
    filterParts.push('#from = :from');
    exprNames['#from'] = 'from';
    exprValues[':from'] = fromFilter;
  }

  const result = await dynamo.send(new ScanCommand({
    TableName: process.env.DRAFTS_TABLE!,
    FilterExpression: filterParts.join(' AND '),
    ExpressionAttributeValues: exprValues,
    ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
  }));

  const drafts = (result.Items ?? []).sort((a, b) => {
    const aTime = (a.updatedAt as string) ?? '';
    const bTime = (b.updatedAt as string) ?? '';
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  let claims;
  try {
    claims = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    // empty body is valid for a new draft
  }

  const { from, to, cc, bcc, subject, body, attachmentKeys, inReplyToMessageId } = payload;

  const draftId = crypto.randomUUID();
  const now = new Date().toISOString();

  const dynamo = getDynamo();
  await dynamo.send(new PutCommand({
    TableName: process.env.DRAFTS_TABLE!,
    Item: {
      draftId,
      userId: claims.sub,
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(cc !== undefined ? { cc } : {}),
      ...(bcc !== undefined ? { bcc } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(attachmentKeys !== undefined ? { attachmentKeys } : {}),
      ...(inReplyToMessageId !== undefined ? { inReplyToMessageId } : {}),
      createdAt: now,
      updatedAt: now,
    },
  }));

  return NextResponse.json({ draftId }, { status: 201 });
}
