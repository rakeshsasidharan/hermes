import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HermesCertStack } from '../lib/hermes-cert-stack';

const MOCK_HOSTED_ZONE_CONTEXT = {
  'hosted-zone:account=123456789012:domainName=rpillai.dev:region=us-east-1': {
    Id: '/hostedzone/Z123456789TEST',
    Name: 'rpillai.dev.',
  },
};

describe('HermesCertStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App({ context: MOCK_HOSTED_ZONE_CONTEXT });
    const stack = new HermesCertStack(app, 'TestHermesCertStack', {
      env: { account: '123456789012', region: 'us-east-1' },
      domainName: 'hermes.rpillai.dev',
      hostedZoneDomainName: 'rpillai.dev',
    });
    template = Template.fromStack(stack);
  });

  test('creates ACM certificate for hermes.rpillai.dev', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'hermes.rpillai.dev',
    });
  });

  test('certificate uses DNS validation', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      ValidationMethod: 'DNS',
    });
  });

  test('certificate is tagged with Project=hermes', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      Tags: Match.arrayWith([{ Key: 'Project', Value: 'hermes' }]),
    });
  });
});
