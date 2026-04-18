import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export interface HermesAppStackProps extends cdk.StackProps {
  emailBucket: s3.IBucket;
  addressesTable: dynamodb.ITable;
  messagesTable: dynamodb.ITable;
  draftsTable: dynamodb.ITable;
  wsConnectionsTable: dynamodb.ITable;
  sesRuleSetName: string;
  websocketEndpoint: string;
}

export class HermesAppStack extends cdk.Stack {
  public readonly userPool: cognito.CfnUserPool;
  public readonly userPoolClient: cognito.CfnUserPoolClient;

  constructor(scope: Construct, id: string, props: HermesAppStackProps) {
    super(scope, id, props);

    // ── Cognito User Pool (#11) ─────────────────────────────────────────────

    this.userPool = new cognito.CfnUserPool(this, 'UserPool', {
      userPoolName: 'hermes-user-pool',
      adminCreateUserConfig: {
        allowAdminCreateUserOnly: true,
      },
      policies: {
        passwordPolicy: {
          minimumLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: true,
        },
      },
      autoVerifiedAttributes: ['email'],
    });
    cdk.Tags.of(this.userPool).add(HERMES_TAG.key, HERMES_TAG.value);

    this.userPoolClient = new cognito.CfnUserPoolClient(this, 'UserPoolClient', {
      clientName: 'hermes-app-client',
      userPoolId: this.userPool.ref,
      explicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      generateSecret: false,
    });

    const adminSecret = new secretsmanager.Secret(this, 'AdminSecret', {
      secretName: 'hermes-admin-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 16,
      },
    });
    cdk.Tags.of(adminSecret).add(HERMES_TAG.key, HERMES_TAG.value);

    // Admin user is created in FORCE_CHANGE_PASSWORD state.
    // Set the initial password with:
    //   aws cognito-idp admin-set-user-password \
    //     --user-pool-id <pool-id> \
    //     --username admin \
    //     --password $(aws secretsmanager get-secret-value --secret-id hermes-admin-credentials --query SecretString --output text | jq -r .password) \
    //     --permanent
    new cognito.CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: this.userPool.ref,
      username: 'admin',
    });

    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      exportName: 'HermesUserPoolId',
      value: this.userPool.ref,
      description: 'Hermes Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      exportName: 'HermesUserPoolClientId',
      value: this.userPoolClient.ref,
      description: 'Hermes Cognito App Client ID',
    });

    // ── Docker image asset (#12) ────────────────────────────────────────────
    // CDK builds the Next.js image and pushes it to the bootstrap ECR repo on
    // every `cdk deploy`. App Runner is updated to the new image URI automatically.

    const appImage = new DockerImageAsset(this, 'AppImage', {
      directory: path.join(__dirname, '../../app'),
    });

    // ── App Runner (#13) ────────────────────────────────────────────────────

    const accessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      roleName: 'hermes-app-runner-ecr-access',
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
    });
    accessRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess'),
    );
    appImage.repository.grantPull(accessRole);
    cdk.Tags.of(accessRole).add(HERMES_TAG.key, HERMES_TAG.value);

    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      roleName: 'hermes-app-runner-instance',
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });
    cdk.Tags.of(instanceRole).add(HERMES_TAG.key, HERMES_TAG.value);

    // SES permissions
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SesPermissions',
      actions: [
        'ses:SendRawEmail',
        'ses:ListIdentities',
        'ses:CreateEmailIdentity',
        'ses:DeleteEmailIdentity',
        'ses:CreateReceiptRule',
        'ses:DeleteReceiptRule',
        'ses:DescribeReceiptRule',
      ],
      resources: ['*'],
    }));

    // S3 permissions
    props.emailBucket.grantReadWrite(instanceRole);
    props.emailBucket.grantDelete(instanceRole);

    // DynamoDB permissions
    props.addressesTable.grantReadWriteData(instanceRole);
    props.messagesTable.grantReadWriteData(instanceRole);
    props.draftsTable.grantReadWriteData(instanceRole);
    props.wsConnectionsTable.grantReadWriteData(instanceRole);

    // Cognito permissions
    instanceRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CognitoPermissions',
      actions: ['cognito-idp:GetUser'],
      resources: [this.userPool.attrArn],
    }));

    const autoScaling = new apprunner.CfnAutoScalingConfiguration(this, 'AutoScaling', {
      autoScalingConfigurationName: 'hermes-scaling',
      minSize: 1,
      maxSize: 3,
    });
    cdk.Tags.of(autoScaling).add(HERMES_TAG.key, HERMES_TAG.value);

    const appRunnerService = new apprunner.CfnService(this, 'AppRunnerService', {
      serviceName: 'hermes-app',
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: appImage.imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '3000',
            runtimeEnvironmentVariables: [
              { name: 'ADDRESSES_TABLE', value: props.addressesTable.tableName },
              { name: 'MESSAGES_TABLE', value: props.messagesTable.tableName },
              { name: 'DRAFTS_TABLE', value: props.draftsTable.tableName },
              { name: 'WS_CONNECTIONS_TABLE', value: props.wsConnectionsTable.tableName },
              { name: 'S3_BUCKET', value: props.emailBucket.bucketName },
              { name: 'SES_RULE_SET_NAME', value: props.sesRuleSetName },
              { name: 'COGNITO_USER_POOL_ID', value: this.userPool.ref },
              { name: 'COGNITO_CLIENT_ID', value: this.userPoolClient.ref },
              { name: 'WEBSOCKET_ENDPOINT', value: props.websocketEndpoint },
            ],
          },
        },
      },
      instanceConfiguration: {
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/login',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      autoScalingConfigurationArn: autoScaling.attrAutoScalingConfigurationArn,
    });
    cdk.Tags.of(appRunnerService).add(HERMES_TAG.key, HERMES_TAG.value);

    new cdk.CfnOutput(this, 'AppRunnerServiceUrlOutput', {
      exportName: 'HermesAppRunnerServiceUrl',
      value: appRunnerService.attrServiceUrl,
      description: 'Hermes App Runner service URL',
    });
  }
}
