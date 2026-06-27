import '@testing-library/jest-dom';

// RTK Query's fetchBaseQuery creates `new Request(...)` internally.
// jsdom does not provide the WHATWG Fetch API globals. Use Next.js's bundled
// @edge-runtime/primitives to supply Request, Response, and Headers.
if (typeof Request === 'undefined') {
  // Edge-runtime fetch depends on several Web API globals that jsdom may lack.
  // Supply them from Node.js built-ins before loading the fetch module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const util = require('node:util');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stream = require('node:stream/web');
  const missing: Record<string, unknown> = {};
  if (typeof TextEncoder === 'undefined') missing.TextEncoder = util.TextEncoder;
  if (typeof TextDecoder === 'undefined') missing.TextDecoder = util.TextDecoder;
  if (typeof ReadableStream === 'undefined') missing.ReadableStream = stream.ReadableStream;
  if (typeof WritableStream === 'undefined') missing.WritableStream = stream.WritableStream;
  if (typeof TransformStream === 'undefined') missing.TransformStream = stream.TransformStream;
  if (Object.keys(missing).length) Object.assign(global, missing);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Request: Req, Response: Res, Headers: Hdrs } = require(
    'next/dist/compiled/@edge-runtime/primitives/fetch.js'
  );
  Object.assign(global, { Request: Req, Response: Res, Headers: Hdrs });
}

// The edge-runtime Request constructor requires absolute URLs. Wrap it so that
// relative URLs (starting with '/') work in test environments by prepending
// 'http://localhost'. This lets RTK Query's fetchBaseQuery operate with the
// '/api' base URL without throwing a parse error.
const _OriginalRequest = global.Request as typeof Request;
class _TestRequest extends _OriginalRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('/')) {
      super(`http://localhost${input}`, init);
    } else {
      super(input, init);
    }
  }
}
(global as unknown as Record<string, unknown>).Request = _TestRequest;

// Provide a default fetch stub so RTK Query's fetchBaseQuery has a fetchFn
// at module-load time. Individual tests override this in their own beforeEach.
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn();
}
