import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from '@/components/settings/settings-view';

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
      <a href={href}>{children}</a>
    ),
  };
});

jest.mock('@/components/domains/add-domain-dialog', () => ({
  AddDomainDialog: ({ trigger, onSuccess }: { trigger?: React.ReactNode; onSuccess: () => void }) => (
    <div data-testid="add-domain-dialog">
      <div data-testid="add-domain-trigger" onClick={onSuccess}>{trigger ?? 'Add domain'}</div>
    </div>
  ),
}));

jest.mock('@/components/addresses/add-address-dialog', () => ({
  AddAddressDialog: ({
    trigger,
    onSuccess,
    defaultDomain,
  }: {
    trigger?: React.ReactNode;
    onSuccess: (addr: unknown) => void;
    defaultDomain?: string;
  }) => (
    <div data-testid={`add-address-dialog${defaultDomain ? `-${defaultDomain}` : ''}`}>
      <div
        data-testid={`add-address-trigger${defaultDomain ? `-${defaultDomain}` : ''}`}
        onClick={() => onSuccess({ email: `new@${defaultDomain ?? 'example.com'}`, domain: defaultDomain ?? 'example.com', status: 'active', createdAt: new Date().toISOString() })}
      >
        {trigger ?? 'Add address'}
      </div>
    </div>
  ),
}));

jest.mock('@/components/addresses/delete-address-dialog', () => ({
  DeleteAddressDialog: ({ email, onSuccess }: { email: string; onSuccess: () => void }) => (
    <button data-testid={`delete-${email}`} onClick={onSuccess}>Delete</button>
  ),
}));

const DOMAINS = [
  { domain: 'example.com', status: 'Verified' as const },
  { domain: 'pending.com', status: 'Pending' as const },
];

const ADDRESSES = [
  { email: 'hello@example.com', domain: 'example.com', status: 'active', createdAt: '2024-01-01T00:00:00Z' },
  { email: 'info@example.com', domain: 'example.com', status: 'active', createdAt: '2024-01-02T00:00:00Z' },
];

const MESSAGES = [
  {
    messageId: 'msg-1',
    address: 'hello@example.com',
    sender: 'alice@other.com',
    subject: 'Hello there',
    receivedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    isRead: false,
  },
];

function renderView(overrides: Partial<React.ComponentProps<typeof SettingsView>> = {}) {
  return render(
    <SettingsView
      domains={DOMAINS}
      addresses={ADDRESSES}
      messageCounts={{ total: 42, unread: 5 }}
      recentMessages={MESSAGES}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
  mockPush.mockReset();
  mockRefresh.mockReset();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('SettingsView', () => {
  describe('header', () => {
    test('renders page title', () => {
      renderView();
      expect(screen.getByText('Domains & Addresses')).toBeInTheDocument();
    });

    test('renders Add Address and Add Domain buttons', () => {
      renderView();
      expect(screen.getByTestId('add-address-btn')).toBeInTheDocument();
      expect(screen.getByTestId('add-domain-btn')).toBeInTheDocument();
    });
  });

  describe('KPI cards', () => {
    test('shows domain count', () => {
      renderView();
      // Two KPI cards both show '02'; verify at least one exists
      expect(screen.getAllByText('02')).toHaveLength(2);
    });

    test('shows address count', () => {
      renderView();
      expect(screen.getAllByText('02')).toHaveLength(2);
    });

    test('shows total message count', () => {
      renderView();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    test('shows unread message count', () => {
      renderView();
      expect(screen.getByText('5 unread')).toBeInTheDocument();
    });
  });

  describe('domain accordions', () => {
    test('renders all domain rows', () => {
      renderView();
      expect(screen.getByTestId('domain-row-example.com')).toBeInTheDocument();
      expect(screen.getByTestId('domain-row-pending.com')).toBeInTheDocument();
    });

    test('shows domain names', () => {
      renderView();
      expect(screen.getByText('example.com')).toBeInTheDocument();
      expect(screen.getByText('pending.com')).toBeInTheDocument();
    });

    test('shows empty state when no domains', () => {
      renderView({ domains: [] });
      expect(screen.getByText(/no domains yet/i)).toBeInTheDocument();
    });

    test('expands domain row to show addresses on click', async () => {
      const user = userEvent.setup();
      renderView();
      await user.click(screen.getByTestId('domain-row-example.com'));
      const list = screen.getByTestId('address-list-example.com');
      expect(list).toBeInTheDocument();
      expect(within(list).getByText('hello@example.com')).toBeInTheDocument();
      expect(within(list).getByText('info@example.com')).toBeInTheDocument();
    });

    test('collapses domain row on second click', async () => {
      const user = userEvent.setup();
      renderView();
      await user.click(screen.getByTestId('domain-row-example.com'));
      expect(screen.getByTestId('address-list-example.com')).toBeInTheDocument();
      await user.click(screen.getByTestId('domain-row-example.com'));
      expect(screen.queryByTestId('address-list-example.com')).not.toBeInTheDocument();
    });

    test('pending domain shows verify message when expanded', async () => {
      const user = userEvent.setup();
      renderView();
      await user.click(screen.getByTestId('domain-row-pending.com'));
      expect(screen.getByText(/verify your domain/i)).toBeInTheDocument();
    });

    test('deleting address removes it from the address list', async () => {
      const user = userEvent.setup();
      renderView();
      await user.click(screen.getByTestId('domain-row-example.com'));
      const list = screen.getByTestId('address-list-example.com');
      expect(within(list).getByText('hello@example.com')).toBeInTheDocument();
      await user.click(screen.getByTestId('delete-hello@example.com'));
      expect(screen.queryByTestId('address-list-example.com')).toBeInTheDocument();
      expect(within(screen.getByTestId('address-list-example.com')).queryByText('hello@example.com')).not.toBeInTheDocument();
    });
  });

  describe('recent activity', () => {
    test('shows recent message subject', () => {
      renderView();
      expect(screen.getByText('Hello there')).toBeInTheDocument();
    });

    test('shows empty state when no messages', () => {
      renderView({ recentMessages: [] });
      expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    });

    test('recent message links to inbox', () => {
      renderView();
      const link = screen.getByRole('link', { name: /hello there/i });
      expect(link).toHaveAttribute(
        'href',
        `/inbox/${encodeURIComponent('hello@example.com')}/msg-1`,
      );
    });
  });
});
