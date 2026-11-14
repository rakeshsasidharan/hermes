import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const appLayout = read('../../app/(app)/layout.tsx');
const dockerfile = read('../../Dockerfile');
const ciWorkflow = read('../../../.github/workflows/app.yml');
const appStack = read('../../../infra/lib/hermes-app-stack.ts');

// The websocket endpoint must be read at request time from the Lambda
// environment. NEXT_PUBLIC_* vars are inlined by `next build` (server code
// included), and the CI lookup that fed the build-arg silently resolved to an
// empty string — so production never opened a websocket (see #262).
describe('WebSocket endpoint runtime wiring', () => {
  it('app layout reads the server-only WEBSOCKET_ENDPOINT at request time', () => {
    expect(appLayout).toContain('process.env.WEBSOCKET_ENDPOINT');
  });

  it('app layout does not read a build-time inlined NEXT_PUBLIC_ endpoint', () => {
    expect(appLayout).not.toMatch(/process\.env\.NEXT_PUBLIC_WEBSOCKET_ENDPOINT/);
  });

  it('app Lambda receives WEBSOCKET_ENDPOINT from the WebSocket stack', () => {
    expect(appStack).toMatch(/WEBSOCKET_ENDPOINT:\s*props\.websocketEndpoint/);
  });

  it('Docker build no longer depends on a websocket build arg', () => {
    expect(dockerfile).not.toContain('WEBSOCKET_ENDPOINT');
  });

  it('CI no longer resolves the endpoint via a swallowed CloudFormation lookup', () => {
    expect(ciWorkflow).not.toContain('WEBSOCKET_ENDPOINT');
    expect(ciWorkflow).not.toContain('HermesWebSocketEndpoint');
  });
});
