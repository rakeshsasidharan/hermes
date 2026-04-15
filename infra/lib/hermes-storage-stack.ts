import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class HermesStorageStack extends cdk.Stack {
  public readonly emailBucket: s3.Bucket;
  public readonly addressesTable: dynamodb.Table;
  public readonly messagesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.emailBucket = new s3.Bucket(this, 'EmailStore', {
      bucketName: 'hermes-email-store',
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'expire-uploads',
          prefix: 'uploads/',
          expiration: cdk.Duration.days(7),
          enabled: true,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.addressesTable = new dynamodb.Table(this, 'AddressesTable', {
      tableName: 'Addresses',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      tableName: 'Messages',
      partitionKey: { name: 'messageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'address-receivedAt-index',
      partitionKey: { name: 'address', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'receivedAt', type: dynamodb.AttributeType.STRING },
    });
  }
}
