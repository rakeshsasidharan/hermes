import { render, screen } from '@testing-library/react';
import { Topbar } from '@/components/layout/topbar';

const { usePathname } = jest.requireMock('next/navigation');

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/'),
}));

describe('Topbar', () => {
  test('shows Hermes for root path', () => {
    usePathname.mockReturnValue('/');
    render(<Topbar />);
    expect(screen.getByText('Hermes')).toBeInTheDocument();
  });

  test('shows Drafts for /drafts', () => {
    usePathname.mockReturnValue('/drafts');
    render(<Topbar />);
    expect(screen.getByText('Drafts')).toBeInTheDocument();
  });

  test('shows Settings for /settings', () => {
    usePathname.mockReturnValue('/settings');
    render(<Topbar />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('shows address email for inbox route', () => {
    usePathname.mockReturnValue('/inbox/hello%40example.com');
    render(<Topbar />);
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
  });

  test('shows address email for message detail route', () => {
    usePathname.mockReturnValue('/inbox/hello%40example.com/msg-123');
    render(<Topbar />);
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
  });
});
