import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class HermesStorageStack extends cdk.Stack {
  public readonly emailBucket: s3.Bucket;

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
  }
}
