import * as cdk from 'aws-cdk-lib/core';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export interface HermesCertStackProps extends cdk.StackProps {
  domainName: string;
  hostedZoneDomainName: string;
}

export class HermesCertStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: HermesCertStackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.hostedZoneDomainName,
    });

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    cdk.Tags.of(this.certificate).add(HERMES_TAG.key, HERMES_TAG.value);
  }
}
