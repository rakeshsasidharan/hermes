import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HermesAuthStack } from '../lib/hermes-auth-stack';

describe('HermesAuthStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new HermesAuthStack(app, 'TestHermesAuthStack');
    template = Template.fromStack(stack);
  });

  describe('Cognito User Pool', () => {
    test('creates User Pool named hermes-user-pool', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'hermes-user-pool',
      });
    });

    test('self-sign-up is disabled', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      });
    });

    test('creates App Client with USER_PASSWORD_AUTH and REFRESH_TOKEN_AUTH', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ClientName: 'hermes-app-client',
        ExplicitAuthFlows: Match.arrayWith([
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ]),
      });
    });

    test('creates admin user', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolUser', {
        Username: 'admin',
      });
    });

    test('outputs User Pool ID', () => {
      template.hasOutput('UserPoolIdOutput', { Export: { Name: 'HermesUserPoolId' } });
    });

    test('outputs App Client ID', () => {
      template.hasOutput('UserPoolClientIdOutput', { Export: { Name: 'HermesUserPoolClientId' } });
    });
  });

  describe('Admin credentials secret', () => {
    test('creates Secrets Manager secret for admin credentials', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'hermes-admin-credentials',
      });
    });

    test('admin secret has DeletionPolicy Delete', () => {
      const resources = template.toJSON().Resources;
      const secrets = Object.values(resources).filter(
        (r: any) => r.Type === 'AWS::SecretsManager::Secret',
      );
      secrets.forEach((s: any) => expect(s.DeletionPolicy).toBe('Delete'));
    });
  });
});
