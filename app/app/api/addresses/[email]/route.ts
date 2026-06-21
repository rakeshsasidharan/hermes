import { NextRequest, NextResponse } from 'next/server';
import { SESClient, DeleteIdentityCommand, DeleteReceiptRuleCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

export async function PATCH(
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
  const normalised = decodeURIComponent(email).trim().toLowerCase();

  let displayName: string | undefined;
  try {
    const body = await req.json();
    displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (displayName === undefined) {
    return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
  }

  const dynamo = getDynamo();
  const existing = await dynamo.send(new GetCommand({
    TableName: process.env.ADDRESSES_TABLE!,
    Key: { email: normalised },
  }));

  if (!existing.Item || existing.Item.status === 'deleted') {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 });
  }

  await dynamo.send(new UpdateCommand({
    TableName: process.env.ADDRESSES_TABLE!,
    Key: { email: normalised },
    UpdateExpression: 'SET displayName = :dn, updatedAt = :now',
    ExpressionAttributeValues: {
      ':dn': displayName,
      ':now': new Date().toISOString(),
    },
  }));

  return NextResponse.json({ address: { ...existing.Item, displayName, updatedAt: new Date().toISOString() } });
}

function getSes() {
  return new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

export async function DELETE(
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
  const normalised = decodeURIComponent(email).trim().toLowerCase();

  const dynamo = getDynamo();
  const existing = await dynamo.send(new GetCommand({
    TableName: process.env.ADDRESSES_TABLE!,
    Key: { email: normalised },
  }));

  if (!existing.Item || existing.Item.status === 'deleted') {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 });
  }

  const ses = getSes();

  await ses.send(new DeleteIdentityCommand({ Identity: normalised }));

  await ses.send(new DeleteReceiptRuleCommand({
    RuleSetName: process.env.SES_RULE_SET_NAME!,
    RuleName: existing.Item.receiptRuleName,
  }));

  await dynamo.send(new UpdateCommand({
    TableName: process.env.ADDRESSES_TABLE!,
    Key: { email: normalised },
    UpdateExpression: 'SET #s = :deleted, updatedAt = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':deleted': 'deleted',
      ':now': new Date().toISOString(),
    },
  }));

  return new NextResponse(null, { status: 204 });
}
