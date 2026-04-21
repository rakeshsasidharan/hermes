import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export class HermesAuthStack extends cdk.Stack {
  public readonly userPool: cognito.CfnUserPool;
  public readonly userPoolClient: cognito.CfnUserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
      exportName: 'HermesAuthUserPoolId',
      value: this.userPool.ref,
      description: 'Hermes Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      exportName: 'HermesAuthUserPoolClientId',
      value: this.userPoolClient.ref,
      description: 'Hermes Cognito App Client ID',
    });
  }
}
