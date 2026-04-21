// Module-level mock instances — shared across all handler invocations per test
const mockS3 = { send: jest.fn() };
const mockDynamo = { send: jest.fn() };
const mockWs = { send: jest.fn() };

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  GetObjectCommand: jest.fn((p: unknown) => p),
  PutObjectCommand: jest.fn((p: unknown) => p),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn() },
  PutCommand: jest.fn((p: unknown) => p),
  ScanCommand: jest.fn((p: unknown) => p),
  DeleteCommand: jest.fn((p: unknown) => p),
}));

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn(),
  PostToConnectionCommand: jest.fn((p: unknown) => p),
}));

jest.mock('mailparser', () => ({
  simpleParser: jest.fn(),
}));

import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { simpleParser } from 'mailparser';

// Set env vars before require so module-level constants in the handler are captured correctly
process.env.MESSAGES_TABLE = 'hermes-messages';
process.env.WS_CONNECTIONS_TABLE = 'hermes-ws-connections';
process.env.S3_BUCKET = 'hermes-email-store';
process.env.WEBSOCKET_API_ENDPOINT = 'https://abc.execute-api.us-east-1.amazonaws.com/prod';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require('../../lambda/inbound-email-processor/index');

const TEST_EVENT = {
  source: 'aws.s3',
  'detail-type': 'Object Created',
  detail: {
    bucket: { name: 'hermes-email-store' },
    object: { key: 'inbound/hello%40example.com/msg-abc123' },
  },
};

const DECODED_ADDRESS = 'hello@example.com';
const MESSAGE_ID = 'msg-abc123';

const PARSED_EMAIL = {
  subject: 'Test Subject',
  from: { text: 'sender@example.com', html: '', value: [] },
  to: { text: 'hello@example.com', html: '', value: [] },
  text: 'Plain text body',
  html: '<p>HTML body</p>',
  attachments: [],
};

function makeBodyStream(content: string) {
  return { transformToString: jest.fn().mockResolvedValue(content) };
}

beforeEach(() => {
  jest.clearAllMocks();

  (S3Client as jest.Mock).mockReturnValue(mockS3);
  (DynamoDBClient as jest.Mock).mockReturnValue({});
  (DynamoDBDocumentClient.from as unknown as jest.Mock).mockReturnValue(mockDynamo);
  (ApiGatewayManagementApiClient as jest.Mock).mockReturnValue(mockWs);
});

describe('InboundEmailProcessor', () => {
  describe('happy path — email with text, HTML, and attachments', () => {
    const attachment = {
      filename: 'file.pdf',
      content: Buffer.from('pdf-content'),
      contentType: 'application/pdf',
    };

    beforeEach(() => {
      mockS3.send.mockResolvedValueOnce({ Body: makeBodyStream('raw mime') }).mockResolvedValue({});
      (simpleParser as jest.Mock).mockResolvedValue({
        ...PARSED_EMAIL,
        attachments: [attachment],
      });
      mockDynamo.send
        .mockResolvedValueOnce({})  // PutCommand (messages)
        .mockResolvedValueOnce({ Items: [{ connectionId: 'conn-1' }, { connectionId: 'conn-2' }] }) // ScanCommand
        .mockResolvedValue({});
      mockWs.send.mockResolvedValue({});
    });

    test('fetches raw email from S3 using the decoded key', async () => {
      await handler(TEST_EVENT);
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'hermes-email-store', Key: `inbound/${DECODED_ADDRESS}/${MESSAGE_ID}` }),
      );
    });

    test('stores text body at parsed/<messageId>/body.txt', async () => {
      await handler(TEST_EVENT);
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'hermes-email-store',
          Key: `parsed/${MESSAGE_ID}/body.txt`,
          Body: PARSED_EMAIL.text,
          ContentType: 'text/plain',
        }),
      );
    });

    test('stores HTML body at parsed/<messageId>/body.html', async () => {
      await handler(TEST_EVENT);
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: `parsed/${MESSAGE_ID}/body.html`,
          Body: PARSED_EMAIL.html,
          ContentType: 'text/html',
        }),
      );
    });

    test('stores attachment at attachments/<messageId>/<filename>', async () => {
      await handler(TEST_EVENT);
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: `attachments/${MESSAGE_ID}/file.pdf`,
          Body: attachment.content,
          ContentType: 'application/pdf',
        }),
      );
    });

    test('writes message record to DynamoDB with direction: inbound', async () => {
      await handler(TEST_EVENT);
      const putCall = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).find(
        ([cmd]) => cmd.TableName === 'hermes-messages',
      );
      expect(putCall).toBeDefined();
      const item = putCall![0].Item as Record<string, unknown>;
      expect(item.messageId).toBe(MESSAGE_ID);
      expect(item.address).toBe(DECODED_ADDRESS);
      expect(item.direction).toBe('inbound');
      expect(item.subject).toBe('Test Subject');
      expect(item.from).toBe('sender@example.com');
      expect(item.to).toBe('hello@example.com');
      expect(item.isRead).toBe(false);
      expect(item.bodyTextS3Key).toBe(`parsed/${MESSAGE_ID}/body.txt`);
      expect(item.bodyHtmlS3Key).toBe(`parsed/${MESSAGE_ID}/body.html`);
      expect(item.attachments).toEqual([`attachments/${MESSAGE_ID}/file.pdf`]);
    });

    test('sends new_message notification to each active WebSocket connection', async () => {
      await handler(TEST_EVENT);
      expect(mockWs.send).toHaveBeenCalledTimes(2);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.objectContaining({ ConnectionId: 'conn-1' }),
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.objectContaining({ ConnectionId: 'conn-2' }),
      );
    });

    test('WebSocket payload contains type, address, and messageId', async () => {
      await handler(TEST_EVENT);
      const [[cmd]] = mockWs.send.mock.calls as Array<[Record<string, unknown>]>;
      const data = JSON.parse((cmd.Data as Buffer).toString());
      expect(data).toEqual({ type: 'new_message', address: DECODED_ADDRESS, messageId: MESSAGE_ID });
    });
  });

  describe('email with text only (no HTML)', () => {
    beforeEach(() => {
      mockS3.send.mockResolvedValueOnce({ Body: makeBodyStream('raw mime') }).mockResolvedValue({});
      (simpleParser as jest.Mock).mockResolvedValue({ ...PARSED_EMAIL, html: false, attachments: [] });
      mockDynamo.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ Items: [] });
    });

    test('does not store body.html in S3', async () => {
      await handler(TEST_EVENT);
      const calls = (mockS3.send.mock.calls as Array<[Record<string, unknown>]>).map(([cmd]) => cmd.Key);
      expect(calls).not.toContain(`parsed/${MESSAGE_ID}/body.html`);
    });

    test('sets bodyHtmlS3Key to undefined in DynamoDB item', async () => {
      await handler(TEST_EVENT);
      const putCall = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).find(
        ([cmd]) => cmd.TableName === 'hermes-messages',
      );
      expect((putCall![0].Item as Record<string, unknown>).bodyHtmlS3Key).toBeUndefined();
    });
  });

  describe('no active WebSocket connections', () => {
    beforeEach(() => {
      mockS3.send.mockResolvedValueOnce({ Body: makeBodyStream('raw mime') }).mockResolvedValue({});
      (simpleParser as jest.Mock).mockResolvedValue({ ...PARSED_EMAIL, attachments: [] });
      mockDynamo.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ Items: [] });
    });

    test('does not call WebSocket management API', async () => {
      await handler(TEST_EVENT);
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('stale WebSocket connection (GoneException)', () => {
    beforeEach(() => {
      mockS3.send.mockResolvedValueOnce({ Body: makeBodyStream('raw mime') }).mockResolvedValue({});
      (simpleParser as jest.Mock).mockResolvedValue({ ...PARSED_EMAIL, attachments: [] });
      mockDynamo.send
        .mockResolvedValueOnce({}) // PutCommand messages
        .mockResolvedValueOnce({ Items: [{ connectionId: 'gone-conn' }] }) // ScanCommand
        .mockResolvedValue({});
      const goneError = Object.assign(new Error('Gone'), { name: 'GoneException' });
      mockWs.send.mockRejectedValue(goneError);
    });

    test('deletes the stale connection from WsConnections table', async () => {
      await handler(TEST_EVENT);
      const deleteCall = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).find(
        ([cmd]) => cmd.TableName === 'hermes-ws-connections' && (cmd.Key as Record<string, unknown>)?.connectionId === 'gone-conn',
      );
      expect(deleteCall).toBeDefined();
    });
  });

  describe('stale WebSocket connection (HTTP 410)', () => {
    beforeEach(() => {
      mockS3.send.mockResolvedValueOnce({ Body: makeBodyStream('raw mime') }).mockResolvedValue({});
      (simpleParser as jest.Mock).mockResolvedValue({ ...PARSED_EMAIL, attachments: [] });
      mockDynamo.send
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Items: [{ connectionId: 'stale-conn' }] })
        .mockResolvedValue({});
      const http410Error = Object.assign(new Error('Gone'), { $metadata: { httpStatusCode: 410 } });
      mockWs.send.mockRejectedValue(http410Error);
    });

    test('deletes the stale connection from WsConnections table', async () => {
      await handler(TEST_EVENT);
      const deleteCall = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).find(
        ([cmd]) => cmd.TableName === 'hermes-ws-connections' && (cmd.Key as Record<string, unknown>)?.connectionId === 'stale-conn',
      );
      expect(deleteCall).toBeDefined();
    });
  });

  describe('malformed MIME email', () => {
    beforeEach(() => {
      mockS3.send.mockResolvedValueOnce({ Body: makeBodyStream('not valid mime') });
      (simpleParser as jest.Mock).mockRejectedValue(new Error('invalid MIME'));
    });

    test('does not throw — handler returns cleanly', async () => {
      await expect(handler(TEST_EVENT)).resolves.toBeUndefined();
    });

    test('does not write anything to DynamoDB', async () => {
      await handler(TEST_EVENT);
      expect(mockDynamo.send).not.toHaveBeenCalled();
    });
  });

  describe('S3 key URL decoding', () => {
    test('decodes percent-encoded address in the S3 key', async () => {
      mockS3.send.mockResolvedValueOnce({ Body: makeBodyStream('raw mime') }).mockResolvedValue({});
      (simpleParser as jest.Mock).mockResolvedValue({ ...PARSED_EMAIL, attachments: [] });
      mockDynamo.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ Items: [] });

      await handler(TEST_EVENT);

      const putCall = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).find(
        ([cmd]) => cmd.TableName === 'hermes-messages',
      );
      expect((putCall![0].Item as Record<string, unknown>).address).toBe(DECODED_ADDRESS);
    });
  });
});
