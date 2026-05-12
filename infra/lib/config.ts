import * as cdk from 'aws-cdk-lib/core';

export interface HermesConfig {
  domainName: string;
  hostedZoneDomainName: string;
  sesRuleSetName: string;
  emailBucketName: string;
  addressesTableName: string;
  messagesTableName: string;
  draftsTableName: string;
  wsConnectionsTableName: string;
}

export function getConfig(app: cdk.App): HermesConfig {
  function required(key: string): string {
    const val = app.node.tryGetContext(key) as string | undefined;
    if (!val) {
      throw new Error(
        `Missing required CDK context key: "${key}". See cdk.context.json.example for all required keys.`,
      );
    }
    return val;
  }

  function optional(key: string, defaultValue: string): string {
    return (app.node.tryGetContext(key) as string | undefined) ?? defaultValue;
  }

  return {
    domainName: required('domainName'),
    hostedZoneDomainName: required('hostedZoneDomainName'),
    sesRuleSetName: optional('sesRuleSetName', 'hermes-receipt-rules'),
    emailBucketName: optional('emailBucketName', 'hermes-email-store'),
    addressesTableName: optional('addressesTableName', 'hermes-addresses'),
    messagesTableName: optional('messagesTableName', 'hermes-messages'),
    draftsTableName: optional('draftsTableName', 'hermes-drafts'),
    wsConnectionsTableName: optional('wsConnectionsTableName', 'hermes-ws-connections'),
  };
}
