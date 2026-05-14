import * as cdk from 'aws-cdk-lib/core';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export class HermesEcrStack extends cdk.Stack {
  public readonly appRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.appRepo = new ecr.Repository(this, 'AppRepo', {
      repositoryName: 'hermes-app',
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          maxImageCount: 10,
          description: 'Keep last 10 images',
        },
      ],
    });
    cdk.Tags.of(this.appRepo).add(HERMES_TAG.key, HERMES_TAG.value);

    new cdk.CfnOutput(this, 'AppRepoUri', {
      exportName: 'HermesAppRepoUri',
      value: this.appRepo.repositoryUri,
    });
  }
}
