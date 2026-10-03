const mockReplace = jest.fn();
// Next's router is a stable context value across renders.
const mockRouter = { replace: mockReplace };

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => mockRouter),
}));

import { render, screen } from '@testing-library/react';
import { DefaultAddressRedirect } from '@/app/(app)/default-address-redirect';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DefaultAddressRedirect', () => {
  test('renders its loading children instead of an empty placeholder', () => {
    render(
      <DefaultAddressRedirect href="/inbox/a%40example.com">
        <div>loading inbox</div>
      </DefaultAddressRedirect>,
    );

    expect(screen.getByText('loading inbox')).toBeInTheDocument();
  });

  test('replaces the current route with the target on mount', () => {
    render(
      <DefaultAddressRedirect href="/inbox/a%40example.com">
        <div>loading inbox</div>
      </DefaultAddressRedirect>,
    );

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/inbox/a%40example.com');
  });

  test('keeps the loading children mounted after triggering the redirect', () => {
    const { rerender } = render(
      <DefaultAddressRedirect href="/inbox/a%40example.com">
        <div>loading inbox</div>
      </DefaultAddressRedirect>,
    );

    rerender(
      <DefaultAddressRedirect href="/inbox/a%40example.com">
        <div>loading inbox</div>
      </DefaultAddressRedirect>,
    );

    expect(screen.getByText('loading inbox')).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
