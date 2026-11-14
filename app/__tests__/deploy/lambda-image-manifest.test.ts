import fs from 'fs';
import path from 'path';

const ciWorkflow = fs.readFileSync(
  path.join(__dirname, '../../../.github/workflows/app.yml'),
  'utf8',
);

// Lambda rejects OCI image indexes. buildx attaches provenance/SBOM
// attestations by default, which turns the pushed image into an index and
// fails the HermesAppStack deploy (see #264).
describe('Lambda container image build', () => {
  const buildCommand = ciWorkflow.match(/docker buildx build[\s\S]*?app\/\n/)?.[0] ?? '';

  it('CI builds the app image with docker buildx', () => {
    expect(buildCommand).not.toBe('');
  });

  it('disables provenance attestations', () => {
    expect(buildCommand).toContain('--provenance=false');
  });

  it('disables SBOM attestations', () => {
    expect(buildCommand).toContain('--sbom=false');
  });

  it('targets the Lambda architecture', () => {
    expect(buildCommand).toContain('--platform linux/amd64');
  });
});
