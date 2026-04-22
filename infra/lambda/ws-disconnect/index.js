'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE;

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  await dynamo.send(new DeleteCommand({
    TableName: WS_CONNECTIONS_TABLE,
    Key: { connectionId },
  }));

  return { statusCode: 200 };
};
