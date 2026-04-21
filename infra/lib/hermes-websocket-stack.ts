import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as path from 'path';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export interface HermesWebSocketStackProps extends cdk.StackProps {
  wsConnectionsTable: dynamodb.ITable;
  userPoolId: string;
}

export class HermesWebSocketStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketEndpoint: string;
  public readonly webSocketApiArn: string;

  constructor(scope: Construct, id: string, props: HermesWebSocketStackProps) {
    super(scope, id, props);

    const connectLogGroup = new logs.LogGroup(this, 'WsConnectHandlerLogGroup', {
      logGroupName: '/aws/lambda/hermes-ws-connect',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const connectHandler = new lambda.Function(this, 'WsConnectHandler', {
      functionName: 'hermes-ws-connect',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/ws-connect')),
      logGroup: connectLogGroup,
      environment: {
        WS_CONNECTIONS_TABLE: props.wsConnectionsTable.tableName,
        COGNITO_USER_POOL_ID: props.userPoolId,
      },
    });
    cdk.Tags.of(connectHandler).add(HERMES_TAG.key, HERMES_TAG.value);
    props.wsConnectionsTable.grantWriteData(connectHandler);

    const disconnectLogGroup = new logs.LogGroup(this, 'WsDisconnectHandlerLogGroup', {
      logGroupName: '/aws/lambda/hermes-ws-disconnect',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const disconnectHandler = new lambda.Function(this, 'WsDisconnectHandler', {
      functionName: 'hermes-ws-disconnect',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/ws-disconnect')),
      logGroup: disconnectLogGroup,
      environment: {
        WS_CONNECTIONS_TABLE: props.wsConnectionsTable.tableName,
      },
    });
    cdk.Tags.of(disconnectHandler).add(HERMES_TAG.key, HERMES_TAG.value);
    props.wsConnectionsTable.grantWriteData(disconnectHandler);

    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'hermes-websocket',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', connectHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', disconnectHandler),
      },
    });
    cdk.Tags.of(this.webSocketApi).add(HERMES_TAG.key, HERMES_TAG.value);

    const stage = new apigatewayv2.WebSocketStage(this, 'ProdStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    this.webSocketEndpoint = stage.url;
    this.webSocketApiArn = this.formatArn({
      service: 'execute-api',
      resource: this.webSocketApi.apiId,
    });

    new cdk.CfnOutput(this, 'WebSocketEndpointOutput', {
      exportName: 'HermesWebSocketEndpoint',
      value: stage.url,
      description: 'Hermes WebSocket API endpoint URL',
    });
  }
}
