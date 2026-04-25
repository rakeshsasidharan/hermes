import { NextRequest, NextResponse } from 'next/server';
import { SESClient, DeleteIdentityCommand, DeleteReceiptRuleCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

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
