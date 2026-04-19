import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export class HermesStorageStack extends cdk.Stack {
  public readonly emailBucket: s3.Bucket;
  public readonly addressesTable: dynamodb.Table;
  public readonly messagesTable: dynamodb.Table;
  public readonly draftsTable: dynamodb.Table;
  public readonly wsConnectionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.emailBucket = new s3.Bucket(this, 'EmailStore', {
      bucketName: 'hermes-email-store',
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      lifecycleRules: [
        {
          id: 'expire-uploads',
          prefix: 'uploads/',
          expiration: cdk.Duration.days(7),
          enabled: true,
        },
      ],
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    cdk.Tags.of(this.emailBucket).add(HERMES_TAG.key, HERMES_TAG.value);

    this.addressesTable = new dynamodb.Table(this, 'AddressesTable', {
      tableName: 'hermes-addresses',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    cdk.Tags.of(this.addressesTable).add(HERMES_TAG.key, HERMES_TAG.value);

    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      tableName: 'hermes-messages',
      partitionKey: { name: 'messageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'address-receivedAt-index',
      partitionKey: { name: 'address', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'receivedAt', type: dynamodb.AttributeType.STRING },
    });
    cdk.Tags.of(this.messagesTable).add(HERMES_TAG.key, HERMES_TAG.value);

    this.draftsTable = new dynamodb.Table(this, 'DraftsTable', {
      tableName: 'hermes-drafts',
      partitionKey: { name: 'draftId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    cdk.Tags.of(this.draftsTable).add(HERMES_TAG.key, HERMES_TAG.value);

    this.wsConnectionsTable = new dynamodb.Table(this, 'WsConnectionsTable', {
      tableName: 'hermes-ws-connections',
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    cdk.Tags.of(this.wsConnectionsTable).add(HERMES_TAG.key, HERMES_TAG.value);
  }
}
