/**
 * @jest-environment node
 */

const mockCookiesGet = jest.fn();
const mockRedirect = jest.fn(() => {
  throw new Error('NEXT_REDIRECT');
});

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({ get: mockCookiesGet })),
}));

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...(args as [])),
}));

jest.mock('@/lib/data/addresses', () => ({
  queryAddresses: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@/components/layout/sidebar', () => ({ AppSidebar: () => null }));
jest.mock('@/components/layout/conditional-layout', () => ({ ConditionalLayout: () => null }));
jest.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: () => null,
  SidebarInset: () => null,
}));
jest.mock('@/components/ws-context', () => ({ WebSocketProvider: () => null }));

import type { ReactElement } from 'react';
import AppLayout from '@/app/(app)/layout';
import { WebSocketProvider } from '@/components/ws-context';

type ProviderElement = ReactElement<{ token: string; wsEndpoint: string }>;

const ORIGINAL_ENV = process.env;

async function renderLayout(): Promise<ProviderElement> {
  return (await AppLayout({ children: null })) as ProviderElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  mockCookiesGet.mockImplementation((name: string) =>
    name === 'access_token' ? { value: 'access-token-123' } : undefined,
  );
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('AppLayout — WebSocket wiring', () => {
  test('passes the runtime WEBSOCKET_ENDPOINT to the WebSocketProvider', async () => {
    process.env.WEBSOCKET_ENDPOINT = 'wss://abc.execute-api.us-west-2.amazonaws.com/prod';

    const element = await renderLayout();

    expect(element.type).toBe(WebSocketProvider);
    expect(element.props.wsEndpoint).toBe('wss://abc.execute-api.us-west-2.amazonaws.com/prod');
    expect(element.props.token).toBe('access-token-123');
  });

  test('reads the endpoint per request rather than at build time', async () => {
    process.env.WEBSOCKET_ENDPOINT = 'wss://first.example/prod';
    expect((await renderLayout()).props.wsEndpoint).toBe('wss://first.example/prod');

    process.env.WEBSOCKET_ENDPOINT = 'wss://second.example/prod';
    expect((await renderLayout()).props.wsEndpoint).toBe('wss://second.example/prod');
  });

  test('ignores the legacy NEXT_PUBLIC_ variable', async () => {
    delete process.env.WEBSOCKET_ENDPOINT;
    process.env.NEXT_PUBLIC_WEBSOCKET_ENDPOINT = 'wss://legacy.example/prod';

    const element = await renderLayout();

    expect(element.props.wsEndpoint).toBe('');
  });

  test('redirects to /login when there is no access token', async () => {
    mockCookiesGet.mockReturnValue(undefined);

    await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
