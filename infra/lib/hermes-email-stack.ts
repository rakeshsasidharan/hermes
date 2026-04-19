import * as cdk from 'aws-cdk-lib/core';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export interface HermesEmailStackProps extends cdk.StackProps {
  emailBucket: s3.IBucket;
  messagesTable: dynamodb.ITable;
  wsConnectionsTable: dynamodb.ITable;
  websocketApiEndpoint: string;
  websocketApiArn: string;
}

export class HermesEmailStack extends cdk.Stack {
  public readonly receiptRuleSet: ses.CfnReceiptRuleSet;
  public readonly sesS3DeliveryRole: iam.Role;
  public readonly inboundEmailProcessor: lambda.Function;

  constructor(scope: Construct, id: string, props: HermesEmailStackProps) {
    super(scope, id, props);

    this.receiptRuleSet = new ses.CfnReceiptRuleSet(this, 'ReceiptRuleSet', {
      ruleSetName: 'hermes-receipt-rules',
    });

    new cdk.CfnResource(this, 'ActiveReceiptRuleSet', {
      type: 'AWS::SES::ReceiptActiveRuleSet',
      properties: {
        RuleSetName: this.receiptRuleSet.ruleSetName!,
      },
    });

    cdk.Tags.of(this.receiptRuleSet).add(HERMES_TAG.key, HERMES_TAG.value);

    this.sesS3DeliveryRole = new iam.Role(this, 'SesS3DeliveryRole', {
      roleName: 'hermes-ses-s3-delivery',
      assumedBy: new iam.ServicePrincipal('ses.amazonaws.com'),
      description: 'Allows SES to deliver inbound email to the hermes-email-store S3 bucket',
    });

    this.sesS3DeliveryRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowSesInboundDelivery',
      actions: ['s3:PutObject'],
      resources: [`${props.emailBucket.bucketArn}/inbound/*`],
    }));

    cdk.Tags.of(this.sesS3DeliveryRole).add(HERMES_TAG.key, HERMES_TAG.value);

    const processorLogGroup = new logs.LogGroup(this, 'InboundEmailProcessorLogGroup', {
      logGroupName: '/aws/lambda/hermes-inbound-email-processor',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.inboundEmailProcessor = new lambda.Function(this, 'InboundEmailProcessor', {
      functionName: 'hermes-inbound-email-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/inbound-email-processor')),
      logGroup: processorLogGroup,
      environment: {
        MESSAGES_TABLE: props.messagesTable.tableName,
        WS_CONNECTIONS_TABLE: props.wsConnectionsTable.tableName,
        S3_BUCKET: props.emailBucket.bucketName,
        WEBSOCKET_API_ENDPOINT: props.websocketApiEndpoint,
      },
    });
    cdk.Tags.of(this.inboundEmailProcessor).add(HERMES_TAG.key, HERMES_TAG.value);

    props.emailBucket.grantRead(this.inboundEmailProcessor);
    props.emailBucket.grantPut(this.inboundEmailProcessor);
    props.messagesTable.grantReadWriteData(this.inboundEmailProcessor);
    props.wsConnectionsTable.grantReadWriteData(this.inboundEmailProcessor);

    this.inboundEmailProcessor.addToRolePolicy(new iam.PolicyStatement({
      sid: 'AllowWebSocketManageConnections',
      actions: ['execute-api:ManageConnections'],
      resources: [`${props.websocketApiArn}/*`],
    }));

    new events.Rule(this, 'InboundEmailRule', {
      ruleName: 'hermes-inbound-email-rule',
      description: 'Triggers InboundEmailProcessor when new email lands in inbound/ prefix',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [props.emailBucket.bucketName] },
          object: { key: [{ prefix: 'inbound/' }] },
        },
      },
      targets: [new eventTargets.LambdaFunction(this.inboundEmailProcessor)],
    });
  }
}
