const mockS3 = { send: jest.fn() };
const mockDynamo = { send: jest.fn() };

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  DeleteObjectCommand: jest.fn((p: unknown) => p),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn() },
  ScanCommand: jest.fn((p: unknown) => p),
  UpdateCommand: jest.fn((p: unknown) => p),
  DeleteCommand: jest.fn((p: unknown) => p),
}));

import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

process.env.MESSAGES_TABLE = 'hermes-messages';
process.env.S3_BUCKET = 'hermes-email-store';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handler } = require('../../lambda/cleanup-expired-messages/index');

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

beforeEach(() => {
  jest.clearAllMocks();
  (S3Client as jest.Mock).mockReturnValue(mockS3);
  (DynamoDBClient as jest.Mock).mockReturnValue({});
  (DynamoDBDocumentClient.from as unknown as jest.Mock).mockReturnValue(mockDynamo);
});

describe('CleanupExpiredMessages', () => {
  describe('junk messages older than 30 days', () => {
    const junkItem = {
      messageId: 'junk-old',
      folder: 'junk',
      folderMovedAt: daysAgo(31),
    };

    beforeEach(() => {
      mockDynamo.send
        .mockResolvedValueOnce({ Items: [junkItem] }) // ScanCommand
        .mockResolvedValue({});                        // UpdateCommand
    });

    test('moves junk message to trash via UpdateCommand', async () => {
      await handler();
      const updateCall = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).find(
        ([cmd]) => cmd.Key && (cmd.Key as Record<string, unknown>).messageId === 'junk-old' && cmd.UpdateExpression,
      );
      expect(updateCall).toBeDefined();
      expect((updateCall![0].ExpressionAttributeValues as Record<string, unknown>)[':trash']).toBe('trash');
    });

    test('does not delete the junk message from DynamoDB', async () => {
      await handler();
      const deleteCalls = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).filter(
        ([cmd]) => cmd.Key && (cmd.Key as Record<string, unknown>).messageId === 'junk-old' && !cmd.UpdateExpression,
      );
      expect(deleteCalls).toHaveLength(0);
    });

    test('does not delete any S3 objects for junk move', async () => {
      await handler();
      expect(mockS3.send).not.toHaveBeenCalled();
    });

    test('returns junkMoved: 1 and trashDeleted: 0', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 1, trashDeleted: 0 });
    });
  });

  describe('junk messages newer than 30 days', () => {
    const recentJunk = {
      messageId: 'junk-recent',
      folder: 'junk',
      folderMovedAt: daysAgo(10),
    };

    beforeEach(() => {
      mockDynamo.send.mockResolvedValueOnce({ Items: [recentJunk] });
    });

    test('does not touch recent junk messages', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 0, trashDeleted: 0 });
      expect(mockDynamo.send).toHaveBeenCalledTimes(1); // only the scan
    });
  });

  describe('trash messages older than 30 days', () => {
    const trashItem = {
      messageId: 'trash-old',
      folder: 'trash',
      folderMovedAt: daysAgo(31),
      bodyTextS3Key: 'parsed/trash-old/body.txt',
      bodyHtmlS3Key: 'parsed/trash-old/body.html',
      attachments: ['attachments/trash-old/file.pdf'],
    };

    beforeEach(() => {
      mockDynamo.send
        .mockResolvedValueOnce({ Items: [trashItem] }) // ScanCommand
        .mockResolvedValue({});                         // DeleteCommand
      mockS3.send.mockResolvedValue({});
    });

    test('deletes the trash message from DynamoDB', async () => {
      await handler();
      const deleteCall = (mockDynamo.send.mock.calls as Array<[Record<string, unknown>]>).find(
        ([cmd]) => cmd.Key && (cmd.Key as Record<string, unknown>).messageId === 'trash-old' && !cmd.UpdateExpression,
      );
      expect(deleteCall).toBeDefined();
    });

    test('deletes bodyTextS3Key from S3', async () => {
      await handler();
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'hermes-email-store', Key: 'parsed/trash-old/body.txt' }),
      );
    });

    test('deletes bodyHtmlS3Key from S3', async () => {
      await handler();
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'parsed/trash-old/body.html' }),
      );
    });

    test('deletes attachment from S3', async () => {
      await handler();
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'attachments/trash-old/file.pdf' }),
      );
    });

    test('returns junkMoved: 0 and trashDeleted: 1', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 0, trashDeleted: 1 });
    });
  });

  describe('trash messages newer than 30 days', () => {
    const recentTrash = {
      messageId: 'trash-recent',
      folder: 'trash',
      folderMovedAt: daysAgo(5),
    };

    beforeEach(() => {
      mockDynamo.send.mockResolvedValueOnce({ Items: [recentTrash] });
    });

    test('does not delete recent trash messages', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 0, trashDeleted: 0 });
      expect(mockS3.send).not.toHaveBeenCalled();
    });
  });

  describe('messages without folderMovedAt', () => {
    const noTimestampItem = {
      messageId: 'old-no-timestamp',
      folder: 'junk',
    };

    beforeEach(() => {
      mockDynamo.send.mockResolvedValueOnce({ Items: [noTimestampItem] });
    });

    test('skips messages without folderMovedAt', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 0, trashDeleted: 0 });
    });
  });

  describe('DynamoDB pagination', () => {
    const page1JunkItem = {
      messageId: 'junk-page1',
      folder: 'junk',
      folderMovedAt: daysAgo(35),
    };
    const page2TrashItem = {
      messageId: 'trash-page2',
      folder: 'trash',
      folderMovedAt: daysAgo(40),
      bodyTextS3Key: 'parsed/trash-page2/body.txt',
      attachments: [],
    };

    beforeEach(() => {
      mockDynamo.send
        .mockResolvedValueOnce({ Items: [page1JunkItem], LastEvaluatedKey: { messageId: 'junk-page1' } }) // page 1
        .mockResolvedValueOnce({ Items: [page2TrashItem] })  // page 2 (no LastEvaluatedKey)
        .mockResolvedValue({});                              // UpdateCommand + DeleteCommand
      mockS3.send.mockResolvedValue({});
    });

    test('processes items across multiple scan pages', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 1, trashDeleted: 1 });
    });
  });

  describe('empty table', () => {
    beforeEach(() => {
      mockDynamo.send.mockResolvedValueOnce({ Items: [] });
    });

    test('returns zeros and makes no mutations', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 0, trashDeleted: 0 });
      expect(mockDynamo.send).toHaveBeenCalledTimes(1); // only the scan
      expect(mockS3.send).not.toHaveBeenCalled();
    });
  });

  describe('trash with no S3 keys', () => {
    const trashNoKeys = {
      messageId: 'trash-no-keys',
      folder: 'trash',
      folderMovedAt: daysAgo(31),
    };

    beforeEach(() => {
      mockDynamo.send
        .mockResolvedValueOnce({ Items: [trashNoKeys] })
        .mockResolvedValue({});
      mockS3.send.mockResolvedValue({});
    });

    test('deletes the DynamoDB record without calling S3', async () => {
      const result = await handler();
      expect(result).toEqual({ junkMoved: 0, trashDeleted: 1 });
      expect(mockS3.send).not.toHaveBeenCalled();
    });
  });
});
