/**
 * @jest-environment node
 */

const mockCookiesGet = jest.fn();

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({ get: mockCookiesGet })),
}));

jest.mock('@/lib/data/addresses', () => ({
  queryAddresses: jest.fn(),
}));

import type { ReactElement } from 'react';
import { queryAddresses } from '@/lib/data/addresses';
import { InboxSkeleton } from '@/components/inbox/inbox-skeleton';
import { ResolveDefaultAddress } from '@/app/(app)/resolve-default-address';
import { DefaultAddressRedirect } from '@/app/(app)/default-address-redirect';

const mockQueryAddresses = queryAddresses as jest.Mock;

type RedirectElement = ReactElement<{ href: string; children: ReactElement }>;

async function resolve(): Promise<RedirectElement> {
  const element = (await ResolveDefaultAddress()) as RedirectElement;
  expect(element.type).toBe(DefaultAddressRedirect);
  return element;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCookiesGet.mockReturnValue(undefined);
});

describe('ResolveDefaultAddress', () => {
  test('redirects to the alphabetically-first active address when no preference is set', async () => {
    mockQueryAddresses.mockResolvedValue([
      { email: 'b@example.com', domain: 'example.com', status: 'active' },
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
    ]);

    const element = await resolve();
    expect(element.props.href).toBe('/inbox/a%40example.com');
  });

  test('redirects to the preferred address when it is still active', async () => {
    mockCookiesGet.mockReturnValue({ value: 'b@example.com' });
    mockQueryAddresses.mockResolvedValue([
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
      { email: 'b@example.com', domain: 'example.com', status: 'active' },
    ]);

    const element = await resolve();
    expect(element.props.href).toBe('/inbox/b%40example.com');
  });

  test('falls back to the first active address when the preferred address is no longer active', async () => {
    mockCookiesGet.mockReturnValue({ value: 'deleted@example.com' });
    mockQueryAddresses.mockResolvedValue([
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
    ]);

    const element = await resolve();
    expect(element.props.href).toBe('/inbox/a%40example.com');
  });

  test('ignores addresses with deleted status', async () => {
    mockQueryAddresses.mockResolvedValue([
      { email: 'a@example.com', domain: 'example.com', status: 'deleted' },
      { email: 'b@example.com', domain: 'example.com', status: 'active' },
    ]);

    const element = await resolve();
    expect(element.props.href).toBe('/inbox/b%40example.com');
  });

  test('keeps the inbox skeleton on screen while redirecting to an inbox', async () => {
    mockQueryAddresses.mockResolvedValue([
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
    ]);

    const element = await resolve();
    expect(element.props.children.type).toBe(InboxSkeleton);
  });

  test('redirects to /settings when there are no active addresses', async () => {
    mockQueryAddresses.mockResolvedValue([]);

    const element = await resolve();
    expect(element.props.href).toBe('/settings');
    expect(element.props.children.type).not.toBe(InboxSkeleton);
  });
});
