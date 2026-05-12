import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from '@/components/settings/settings-view';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const DOMAINS = [
  { domain: 'example.com', status: 'Verified' as const },
  { domain: 'pending.com', status: 'Pending' as const },
  { domain: 'failed.com', status: 'Failed' as const },
];

const ADDRESSES = [
  { email: 'hello@example.com', domain: 'example.com', status: 'active' },
  { email: 'info@example.com', domain: 'example.com', status: 'active' },
];

beforeEach(() => {
  global.fetch = jest.fn();
  mockPush.mockReset();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('SettingsView', () => {
  describe('domains section', () => {
    test('lists all domains', () => {
      render(<SettingsView domains={DOMAINS} addresses={[]} />);
      expect(screen.getByText('example.com')).toBeInTheDocument();
      expect(screen.getByText('pending.com')).toBeInTheDocument();
      expect(screen.getByText('failed.com')).toBeInTheDocument();
    });

    test('shows Verified badge for verified domain', () => {
      render(<SettingsView domains={DOMAINS} addresses={[]} />);
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });

    test('shows Pending badge for pending domain', () => {
      render(<SettingsView domains={DOMAINS} addresses={[]} />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    test('shows Failed badge for failed domain', () => {
      render(<SettingsView domains={DOMAINS} addresses={[]} />);
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    test('shows empty state when no domains', () => {
      render(<SettingsView domains={[]} addresses={[]} />);
      expect(screen.getByText(/no domains configured/i)).toBeInTheDocument();
    });
  });

  describe('addresses section', () => {
    test('lists all addresses with their domains', () => {
      render(<SettingsView domains={[]} addresses={ADDRESSES} />);
      expect(screen.getByText('hello@example.com')).toBeInTheDocument();
      expect(screen.getByText('info@example.com')).toBeInTheDocument();
    });

    test('shows Active badge for active addresses', () => {
      render(<SettingsView domains={[]} addresses={ADDRESSES} />);
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges).toHaveLength(2);
    });

    test('shows empty state when no addresses', () => {
      render(<SettingsView domains={[]} addresses={[]} />);
      expect(screen.getByText(/no addresses configured/i)).toBeInTheDocument();
    });
  });

  describe('sign out', () => {
    test('calls signout endpoint and redirects to login', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<SettingsView domains={DOMAINS} addresses={ADDRESSES} />);

      await user.click(screen.getByTestId('sign-out-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' });
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    test('renders sign out button with destructive style', () => {
      render(<SettingsView domains={DOMAINS} addresses={ADDRESSES} />);
      const btn = screen.getByTestId('sign-out-button');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent(/sign out/i);
    });
  });
});
