import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
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
  userPool: cognito.CfnUserPool;
  userPoolClient: cognito.CfnUserPoolClient;
  /** Custom domain to serve the app from (e.g. hermes.rpillai.dev). Requires certificate + hostedZoneDomainName. */
  domainName?: string;
  /** ACM certificate for domainName — must be in us-east-1. */
  certificate?: acm.ICertificate;
  /** Route 53 hosted zone domain (e.g. rpillai.dev) for creating the A record alias. */
  hostedZoneDomainName?: string;
}

export class HermesAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HermesAppStackProps) {
    super(scope, id, props);

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
      resources: [props.userPool.attrArn],
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
        COGNITO_USER_POOL_ID: props.userPool.ref,
        COGNITO_CLIENT_ID: props.userPoolClient.ref,
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
      ...(props.domainName && props.certificate ? {
        domainNames: [props.domainName],
        certificate: props.certificate,
      } : {}),
    });
    cdk.Tags.of(distribution).add(HERMES_TAG.key, HERMES_TAG.value);

    // ── Route 53 alias record ───────────────────────────────────────────────
    if (props.domainName && props.hostedZoneDomainName) {
      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: props.hostedZoneDomainName,
      });
      new route53.ARecord(this, 'AppARecord', {
        zone: hostedZone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(distribution),
        ),
      });
    }

    new cdk.CfnOutput(this, 'AppUrlOutput', {
      exportName: 'HermesAppUrl',
      value: props.domainName
        ? `https://${props.domainName}`
        : `https://${distribution.distributionDomainName}`,
      description: 'Hermes app URL',
    });

    // ── EventBridge warmer ─────────────────────────────────────────────────
    // Pings the Lambda every 5 minutes to prevent cold starts.
    const warmerRule = new events.Rule(this, 'WarmingRule', {
      ruleName: 'hermes-app-warmer',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });
    warmerRule.addTarget(new eventTargets.LambdaFunction(appFunction, {
      event: events.RuleTargetInput.fromObject({ source: 'hermes-warmer' }),
    }));
    cdk.Tags.of(warmerRule).add(HERMES_TAG.key, HERMES_TAG.value);
  }
}
