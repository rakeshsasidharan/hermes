import { NextRequest, NextResponse } from 'next/server';
import { SESClient, ListIdentitiesCommand, CreateReceiptRuleCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuth, AuthError } from '@/lib/auth/require-auth';

function getSes() {
  return new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
}

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

  const addresses = result.Items ?? [];

  // Fetch unread counts for all active addresses in parallel.
  const withCounts = await Promise.all(
    addresses.map(async (addr) => {
      if (addr.status !== 'active') return { ...addr, unreadCount: 0 };
      try {
        const unread = await dynamo.send(new QueryCommand({
          TableName: process.env.MESSAGES_TABLE!,
          IndexName: 'address-receivedAt-index',
          KeyConditionExpression: 'address = :addr',
          FilterExpression: 'isRead = :false AND direction = :dir',
          ExpressionAttributeValues: { ':addr': addr.email, ':false': false, ':dir': 'inbound' },
          Select: 'COUNT',
        }));
        return { ...addr, unreadCount: unread.Count ?? 0 };
      } catch {
        return { ...addr, unreadCount: 0 };
      }
    }),
  );

  return NextResponse.json({ addresses: withCounts });
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let email: string;
  let displayName: string | undefined;
  try {
    const body = await req.json();
    email = body?.email?.trim().toLowerCase();
    displayName = typeof body?.displayName === 'string' ? body.displayName.trim() || undefined : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const domain = email.split('@')[1];
  const ses = getSes();
  const dynamo = getDynamo();

  // Check domain is verified in SES
  const identities = await ses.send(new ListIdentitiesCommand({ IdentityType: 'Domain' }));
  if (!identities.Identities?.includes(domain)) {
    return NextResponse.json({ error: `Domain ${domain} is not verified in SES` }, { status: 400 });
  }

  // Check for duplicate
  const existing = await dynamo.send(new GetCommand({ TableName: process.env.ADDRESSES_TABLE!, Key: { email } }));
  if (existing.Item && existing.Item.status !== 'deleted') {
    return NextResponse.json({ error: 'Address already exists' }, { status: 409 });
  }

  // Create SES receipt rule
  const ruleName = `hermes-recv-${email.replace('@', '-at-').replace(/\./g, '-')}`;
  await ses.send(new CreateReceiptRuleCommand({
    RuleSetName: process.env.SES_RULE_SET_NAME!,
    Rule: {
      Name: ruleName,
      Enabled: true,
      Recipients: [email],
      Actions: [
        {
          S3Action: {
            BucketName: process.env.S3_BUCKET!,
            ObjectKeyPrefix: `inbound/${email}/`,
          },
        },
        {
          LambdaAction: {
            FunctionArn: process.env.INBOUND_PROCESSOR_ARN!,
            InvocationType: 'Event',
          },
        },
      ],
    },
  }));

  const now = new Date().toISOString();
  const item = {
    email,
    domain,
    status: 'active',
    receiptRuleName: ruleName,
    createdAt: now,
    updatedAt: now,
    ...(displayName ? { displayName } : {}),
  };

  await dynamo.send(new PutCommand({ TableName: process.env.ADDRESSES_TABLE!, Item: item }));

  return NextResponse.json({ address: item }, { status: 201 });
}
