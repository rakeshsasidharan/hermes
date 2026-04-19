import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
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

    // ── Cognito User Pool ───────────────────────────────────────────────────

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
        passwordLength: 16,
        requireEachIncludedType: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
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

    // ── Lambda execution role ───────────────────────────────────────────────

    const executionRole = new iam.Role(this, 'AppFunctionRole', {
      roleName: 'hermes-app-function',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    cdk.Tags.of(executionRole).add(HERMES_TAG.key, HERMES_TAG.value);

    executionRole.addToPolicy(new iam.PolicyStatement({
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

    props.emailBucket.grantReadWrite(executionRole);
    props.emailBucket.grantDelete(executionRole);
    props.addressesTable.grantReadWriteData(executionRole);
    props.messagesTable.grantReadWriteData(executionRole);
    props.draftsTable.grantReadWriteData(executionRole);
    props.wsConnectionsTable.grantReadWriteData(executionRole);

    executionRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CognitoPermissions',
      actions: ['cognito-idp:GetUser'],
      resources: [this.userPool.attrArn],
    }));

    // ── Lambda function (Next.js container + Lambda Web Adapter) ───────────

    const appLogGroup = new logs.LogGroup(this, 'AppFunctionLogGroup', {
      logGroupName: '/aws/lambda/hermes-app',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const appFunction = new lambda.DockerImageFunction(this, 'AppFunction', {
      functionName: 'hermes-app',
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../app'), {
        platform: Platform.LINUX_AMD64,
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      architecture: lambda.Architecture.X86_64,
      role: executionRole,
      logGroup: appLogGroup,
      environment: {
        PORT: '3000',
        ADDRESSES_TABLE: props.addressesTable.tableName,
        MESSAGES_TABLE: props.messagesTable.tableName,
        DRAFTS_TABLE: props.draftsTable.tableName,
        WS_CONNECTIONS_TABLE: props.wsConnectionsTable.tableName,
        S3_BUCKET: props.emailBucket.bucketName,
        SES_RULE_SET_NAME: props.sesRuleSetName,
        COGNITO_USER_POOL_ID: this.userPool.ref,
        COGNITO_CLIENT_ID: this.userPoolClient.ref,
        WEBSOCKET_ENDPOINT: props.websocketEndpoint,
      },
    });
    cdk.Tags.of(appFunction).add(HERMES_TAG.key, HERMES_TAG.value);

    // ── Function URL + CloudFront ───────────────────────────────────────────

    const functionUrl = appFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    const distribution = new cloudfront.Distribution(this, 'AppDistribution', {
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(functionUrl),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    cdk.Tags.of(distribution).add(HERMES_TAG.key, HERMES_TAG.value);

    new cdk.CfnOutput(this, 'AppUrlOutput', {
      exportName: 'HermesAppUrl',
      value: `https://${distribution.distributionDomainName}`,
      description: 'Hermes app URL (CloudFront)',
    });
  }
}
