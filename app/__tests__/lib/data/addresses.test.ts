/**
 * @jest-environment node
 */

const mockDynamoSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockDynamoSend })) },
  ScanCommand: jest.fn((p: unknown) => p),
  QueryCommand: jest.fn((p: unknown) => p),
}));

process.env.ADDRESSES_TABLE = 'hermes-addresses';
process.env.MESSAGES_TABLE = 'hermes-messages';

import { queryAddresses } from '@/lib/data/addresses';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('queryAddresses', () => {
  function setupMock(addresses: unknown[], unreadCount = 0) {
    mockDynamoSend.mockImplementation((cmd: Record<string, unknown>) => {
      if ('IndexName' in cmd) return Promise.resolve({ Count: unreadCount });
      return Promise.resolve({ Items: addresses });
    });
  }

  test('returns active addresses with unread counts', async () => {
    setupMock([{ email: 'a@example.com', domain: 'example.com', status: 'active' }], 5);

    const result = await queryAddresses();

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('a@example.com');
    expect(result[0].unreadCount).toBe(5);
  });

  test('returns empty array when no addresses exist', async () => {
    setupMock([]);

    const result = await queryAddresses();
    expect(result).toEqual([]);
  });

  test('sets unreadCount to 0 for non-active addresses without querying messages table', async () => {
    setupMock([{ email: 'x@example.com', domain: 'example.com', status: 'suspended' }]);

    const result = await queryAddresses();

    expect(result[0].unreadCount).toBe(0);
    // ScanCommand fired once; QueryCommand must not have been called
    const calls = mockDynamoSend.mock.calls as [Record<string, unknown>][];
    expect(calls.every(([cmd]) => !('IndexName' in cmd))).toBe(true);
  });

  test('fetches unread counts in parallel for multiple active addresses', async () => {
    setupMock([
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
      { email: 'b@example.com', domain: 'example.com', status: 'active' },
    ], 2);

    const result = await queryAddresses();

    expect(result).toHaveLength(2);
    expect(result.every((a) => a.unreadCount === 2)).toBe(true);
  });

  test('falls back to unreadCount 0 when messages query fails', async () => {
    mockDynamoSend.mockImplementation((cmd: Record<string, unknown>) => {
      if ('IndexName' in cmd) return Promise.reject(new Error('DynamoDB error'));
      return Promise.resolve({ Items: [{ email: 'a@example.com', domain: 'example.com', status: 'active' }] });
    });

    const result = await queryAddresses();
    expect(result[0].unreadCount).toBe(0);
  });

  test('unread count query filters to inbox folder only', async () => {
    setupMock([{ email: 'a@example.com', domain: 'example.com', status: 'active' }], 3);

    await queryAddresses();

    const queryArg = (mockDynamoSend.mock.calls as [Record<string, unknown>][])
      .map(([cmd]) => cmd)
      .find((cmd) => 'IndexName' in cmd);

    expect(queryArg).toMatchObject({
      FilterExpression: expect.stringContaining('attribute_not_exists(#folder)'),
      ExpressionAttributeNames: expect.objectContaining({ '#folder': 'folder' }),
      ExpressionAttributeValues: expect.objectContaining({ ':inbox': 'inbox' }),
    });
  });

  test('scan filters out soft-deleted addresses via FilterExpression', async () => {
    setupMock([]);

    await queryAddresses();

    const scanArg = (mockDynamoSend.mock.calls[0] as [Record<string, unknown>])[0];
    expect(scanArg).toMatchObject({
      FilterExpression: expect.stringContaining('<>'),
      ExpressionAttributeValues: expect.objectContaining({ ':deleted': 'deleted' }),
    });
  });
});
