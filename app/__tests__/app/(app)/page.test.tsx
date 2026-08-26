/**
 * @jest-environment node
 */

const mockCookiesGet = jest.fn();

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({ get: mockCookiesGet })),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

jest.mock('@/lib/data/addresses', () => ({
  queryAddresses: jest.fn(),
}));

import { redirect } from 'next/navigation';
import { queryAddresses } from '@/lib/data/addresses';
import DefaultPage from '@/app/(app)/page';

const mockQueryAddresses = queryAddresses as jest.Mock;
const mockRedirect = redirect as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCookiesGet.mockReturnValue(undefined);
});

describe('DefaultPage', () => {
  test('redirects to the alphabetically-first active address when no preference is set', async () => {
    mockQueryAddresses.mockResolvedValue([
      { email: 'b@example.com', domain: 'example.com', status: 'active' },
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
    ]);

    await expect(DefaultPage()).rejects.toThrow('REDIRECT:/inbox/a%40example.com');
    expect(mockRedirect).toHaveBeenCalledWith('/inbox/a%40example.com');
  });

  test('redirects to the preferred address when it is still active', async () => {
    mockCookiesGet.mockReturnValue({ value: 'b@example.com' });
    mockQueryAddresses.mockResolvedValue([
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
      { email: 'b@example.com', domain: 'example.com', status: 'active' },
    ]);

    await expect(DefaultPage()).rejects.toThrow('REDIRECT:/inbox/b%40example.com');
  });

  test('falls back to the first active address when the preferred address is no longer active', async () => {
    mockCookiesGet.mockReturnValue({ value: 'deleted@example.com' });
    mockQueryAddresses.mockResolvedValue([
      { email: 'a@example.com', domain: 'example.com', status: 'active' },
    ]);

    await expect(DefaultPage()).rejects.toThrow('REDIRECT:/inbox/a%40example.com');
  });

  test('redirects to /settings when there are no active addresses', async () => {
    mockQueryAddresses.mockResolvedValue([]);

    await expect(DefaultPage()).rejects.toThrow('REDIRECT:/settings');
  });
});
