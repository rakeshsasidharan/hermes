import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let claims;
  try {
    claims = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { id: draftId } = await params;
  const dynamo = getDynamo();

  const result = await dynamo.send(new GetCommand({
    TableName: process.env.DRAFTS_TABLE!,
    Key: { draftId },
  }));

  if (!result.Item) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  if (result.Item.userId !== claims.sub) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ draft: result.Item });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let claims;
  try {
    claims = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { id: draftId } = await params;

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    // empty body results in only updatedAt being set
  }

  const allowed = ['from', 'to', 'cc', 'bcc', 'subject', 'body', 'attachmentKeys', 'inReplyToMessageId'];
  const updateParts: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {
    ':userId': claims.sub,
    ':now': new Date().toISOString(),
  };

  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      updateParts.push(`#${field} = :${field}`);
      names[`#${field}`] = field;
      values[`:${field}`] = payload[field];
    }
  }

  updateParts.push('updatedAt = :now');
  updateParts.push('userId = :userId');

  const dynamo = getDynamo();
  await dynamo.send(new UpdateCommand({
    TableName: process.env.DRAFTS_TABLE!,
    Key: { draftId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ConditionExpression: 'attribute_not_exists(draftId) OR userId = :userId',
    ExpressionAttributeNames: { ...names },
    ExpressionAttributeValues: values,
  }));

  return NextResponse.json({ draftId });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let claims;
  try {
    claims = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { id: draftId } = await params;
  const dynamo = getDynamo();

  const existing = await dynamo.send(new GetCommand({
    TableName: process.env.DRAFTS_TABLE!,
    Key: { draftId },
  }));

  if (!existing.Item) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  if (existing.Item.userId !== claims.sub) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await dynamo.send(new DeleteCommand({
    TableName: process.env.DRAFTS_TABLE!,
    Key: { draftId },
  }));

  return new NextResponse(null, { status: 204 });
}
