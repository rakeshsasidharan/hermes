import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export interface Address {
  email: string;
  domain: string;
  status: string;
  unreadCount: number;
  [key: string]: unknown;
}

function getDynamo() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' }));
}

export async function queryAddresses(): Promise<Address[]> {
  const dynamo = getDynamo();

  const result = await dynamo.send(new ScanCommand({
    TableName: process.env.ADDRESSES_TABLE!,
    FilterExpression: '#s <> :deleted',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':deleted': 'deleted' },
  }));

  const items = result.Items ?? [];

  return Promise.all(
    items.map(async (addr) => {
      if (addr.status !== 'active') return { ...addr, unreadCount: 0 } as Address;
      try {
        const unread = await dynamo.send(new QueryCommand({
          TableName: process.env.MESSAGES_TABLE!,
          IndexName: 'address-receivedAt-index',
          KeyConditionExpression: 'address = :addr',
          FilterExpression: 'isRead = :false AND direction = :dir AND (#folder = :inbox OR attribute_not_exists(#folder))',
          ExpressionAttributeNames: { '#folder': 'folder' },
          ExpressionAttributeValues: { ':addr': addr.email, ':false': false, ':dir': 'inbound', ':inbox': 'inbox' },
          Select: 'COUNT',
        }));
        return { ...addr, unreadCount: unread.Count ?? 0 } as Address;
      } catch {
        return { ...addr, unreadCount: 0 } as Address;
      }
    }),
  );
}
