const mockDynamo = { send: jest.fn() };

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn() },
  DeleteCommand: jest.fn((p: unknown) => p),
}));

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

process.env.WS_CONNECTIONS_TABLE = 'hermes-ws-connections';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require('../../lambda/ws-disconnect/index');

function makeEvent(connectionId = 'conn-abc') {
  return { requestContext: { connectionId } };
}

beforeEach(() => {
  jest.clearAllMocks();
  (DynamoDBClient as jest.Mock).mockReturnValue({});
  (DynamoDBDocumentClient.from as unknown as jest.Mock).mockReturnValue(mockDynamo);
  mockDynamo.send.mockResolvedValue({});
});

describe('WsDisconnectHandler', () => {
  test('returns 200', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
  });

  test('deletes the connection record by connectionId', async () => {
    await handler(makeEvent('conn-xyz'));

    expect(mockDynamo.send).toHaveBeenCalledTimes(1);
    const deleteArg = (mockDynamo.send.mock.calls[0] as [Record<string, unknown>])[0];
    expect(deleteArg).toMatchObject({
      TableName: 'hermes-ws-connections',
      Key: { connectionId: 'conn-xyz' },
    });
  });

  test('does not error if the record no longer exists (DynamoDB DeleteItem is idempotent)', async () => {
    mockDynamo.send.mockResolvedValue({});
    await expect(handler(makeEvent('gone-conn'))).resolves.toMatchObject({ statusCode: 200 });
  });
});
