jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@/components/layout/topbar', () => ({
  Topbar: () => <div data-testid="topbar" />,
}));

import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { ConditionalLayout } from '@/components/layout/conditional-layout';

const mockUsePathname = usePathname as jest.Mock;

function renderAt(pathname: string) {
  mockUsePathname.mockReturnValue(pathname);
  render(
    <ConditionalLayout>
      <div data-testid="content" />
    </ConditionalLayout>,
  );
  return screen.getByTestId('content').parentElement!;
}

describe('ConditionalLayout', () => {
  test('uses the padded page wrapper for non-mailbox routes', () => {
    expect(renderAt('/settings')).toHaveClass('px-6');
  });

  test('uses the mailbox wrapper for mailbox routes', () => {
    const wrapper = renderAt('/inbox/a%40example.com');
    expect(wrapper).toHaveClass('min-h-0');
    expect(wrapper).not.toHaveClass('px-6');
  });

  test('uses the mailbox wrapper on / so the redirect skeleton does not shift', () => {
    const wrapper = renderAt('/');
    expect(wrapper).toHaveClass('min-h-0');
    expect(wrapper).not.toHaveClass('px-6');
  });

  test('always renders the topbar', () => {
    renderAt('/');
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
  });
});
