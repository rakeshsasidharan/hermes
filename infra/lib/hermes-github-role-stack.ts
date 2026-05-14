import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

const GITHUB_OIDC_PROVIDER = 'token.actions.githubusercontent.com';
const GITHUB_REPO = 'repo:rakeshsasidharan/hermes:*';
const CDK_QUALIFIER = 'hnb659fds';

export interface HermesGithubRoleStackProps extends cdk.StackProps {
  /** ECR repository name to allow image push. */
  ecrRepositoryName: string;
  /** SSM parameter name for the image digest. */
  ssmDigestParam: string;
}

export class HermesGithubRoleStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: HermesGithubRoleStackProps) {
    super(scope, id, props);

    const oidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/${GITHUB_OIDC_PROVIDER}`;

    this.deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'hermes-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(oidcProviderArn, {
        StringLike: {
          [`${GITHUB_OIDC_PROVIDER}:sub`]: GITHUB_REPO,
        },
        StringEquals: {
          [`${GITHUB_OIDC_PROVIDER}:aud`]: 'sts.amazonaws.com',
        },
      }),
      description: 'Assumed by GitHub Actions to deploy the Hermes application',
    });
    cdk.Tags.of(this.deployRole).add(HERMES_TAG.key, HERMES_TAG.value);

    // ── Assume CDK bootstrap roles ─────────────────────────────────────────
    // CDK deploy delegates to these roles — the GitHub Actions role only needs
    // to assume them, not hold broad CloudFormation/IAM permissions directly.
    this.deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'CdkBootstrapRoles',
      actions: ['sts:AssumeRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-deploy-role-${this.account}-${this.region}`,
        `arn:aws:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-file-publishing-role-${this.account}-${this.region}`,
        `arn:aws:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-image-publishing-role-${this.account}-${this.region}`,
        `arn:aws:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-lookup-role-${this.account}-${this.region}`,
      ],
    }));

    // ── ECR — docker login + image push ───────────────────────────────────
    this.deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrAuth',
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    this.deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrPush',
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'ecr:BatchGetImage',
        'ecr:GetDownloadUrlForLayer',
      ],
      resources: [
        `arn:aws:ecr:${this.region}:${this.account}:repository/${props.ecrRepositoryName}`,
      ],
    }));

    // ── SSM — store and read image digest ─────────────────────────────────
    this.deployRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SsmDigest',
      actions: ['ssm:PutParameter', 'ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter${props.ssmDigestParam}`,
      ],
    }));

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      exportName: 'HermesGithubDeployRoleArn',
      value: this.deployRole.roleArn,
      description: 'Add this ARN as the AWS_ROLE_ARN GitHub Actions variable',
    });
  }
}
