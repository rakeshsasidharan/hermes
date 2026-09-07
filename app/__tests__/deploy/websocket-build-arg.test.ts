import fs from 'fs';
import path from 'path';

const dockerfile = fs.readFileSync(path.join(__dirname, '../../Dockerfile'), 'utf8');
const ciWorkflow = fs.readFileSync(
  path.join(__dirname, '../../../.github/workflows/app.yml'),
  'utf8',
);

// NEXT_PUBLIC_* vars are inlined by Next.js at `next build` time, not read at
// Lambda runtime. If either half of this wiring is removed, the websocket
// endpoint silently bakes in as an empty string and realtime updates break
// with no error (see #244).
describe('NEXT_PUBLIC_WEBSOCKET_ENDPOINT build-time wiring', () => {
  it('Dockerfile declares the build arg before `next build` runs', () => {
    const argIndex = dockerfile.indexOf('ARG NEXT_PUBLIC_WEBSOCKET_ENDPOINT');
    const buildIndex = dockerfile.indexOf('RUN npm run build');
    expect(argIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(argIndex).toBeLessThan(buildIndex);
  });

  it('Dockerfile forwards the build arg into the build environment', () => {
    expect(dockerfile).toMatch(
      /ENV NEXT_PUBLIC_WEBSOCKET_ENDPOINT=\$NEXT_PUBLIC_WEBSOCKET_ENDPOINT/,
    );
  });

  it('CI workflow passes the build arg to the docker build', () => {
    expect(ciWorkflow).toMatch(/--build-arg NEXT_PUBLIC_WEBSOCKET_ENDPOINT=/);
  });

  it('CI workflow resolves the endpoint from the deployed WebSocket stack export', () => {
    expect(ciWorkflow).toContain("Name=='HermesWebSocketEndpoint'");
  });
});
