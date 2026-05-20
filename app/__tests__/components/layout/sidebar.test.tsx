import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppSidebar } from '@/components/layout/sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { WsNewMessageEvent } from '@/lib/ws';

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue('/');
const mockOpenCompose = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/link', () => {
  const OriginalLink = jest.requireActual('next/link').default;
  return {
    __esModule: true,
    default: OriginalLink,
    useLinkStatus: () => ({ pending: false }),
  };
});

let wsHandler: ((event: WsNewMessageEvent) => void) | null = null;
const mockSubscribe = jest.fn((handler: (event: WsNewMessageEvent) => void) => {
  wsHandler = handler;
  return () => {
    wsHandler = null;
  };
});

jest.mock('@/components/ws-context', () => ({
  useWs: () => ({ subscribe: mockSubscribe }),
}));

jest.mock('@/components/compose-context', () => ({
  useCompose: () => ({
    openCompose: mockOpenCompose,
    closeCompose: jest.fn(),
    isOpen: false,
    initialData: null,
  }),
}));

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

const ADDRESSES = [
  { email: 'hello@example.com', domain: 'example.com', status: 'active', unreadCount: 3 },
  { email: 'info@example.com', domain: 'example.com', status: 'active', unreadCount: 0 },
];

function renderSidebar(addresses = ADDRESSES) {
  return render(
    <SidebarProvider>
      <AppSidebar addresses={addresses} />
    </SidebarProvider>,
  );
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

beforeEach(() => {
  global.fetch = jest.fn();
  mockPathname.mockReturnValue('/');
  mockPush.mockReset();
  wsHandler = null;
  mockSubscribe.mockClear();
  mockOpenCompose.mockReset();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('AppSidebar', () => {
  test('renders address links', () => {
    renderSidebar();
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
    expect(screen.getByText('info@example.com')).toBeInTheDocument();
  });

  test('shows unread count badge when unreadCount > 0', () => {
    renderSidebar();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('shows empty state when no addresses', () => {
    renderSidebar([]);
    expect(screen.getByText(/no addresses yet/i)).toBeInTheDocument();
  });

  test('renders Compose, Addresses, Domains, Settings links', () => {
    renderSidebar();
    expect(screen.getByText('Compose')).toBeInTheDocument();
    expect(screen.getByText('Addresses')).toBeInTheDocument();
    expect(screen.getByText('Domains')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('renders Drafts sub-nav for each address', () => {
    renderSidebar();
    expect(screen.getAllByText('Drafts')).toHaveLength(ADDRESSES.length);
  });

  test('Drafts sub-link points to /drafts/[address]', () => {
    renderSidebar();
    const draftsLinks = screen.getAllByRole('link', { name: /^drafts$/i });
    expect(draftsLinks[0]).toHaveAttribute('href', '/drafts/hello%40example.com');
  });

  test('Drafts sub-link has active state when on drafts route', () => {
    mockPathname.mockReturnValue('/drafts/hello%40example.com');
    renderSidebar();
    const draftsLinks = screen.getAllByRole('link', { name: /^drafts$/i });
    expect(draftsLinks[0]).toHaveAttribute('data-active', 'true');
  });

  test('Addresses link points to /addresses', () => {
    renderSidebar();
    const link = screen.getByRole('link', { name: /^addresses$/i });
    expect(link).toHaveAttribute('href', '/addresses');
  });

  test('Addresses link has active state when pathname is /addresses', () => {
    mockPathname.mockReturnValue('/addresses');
    renderSidebar();
    const link = screen.getByRole('link', { name: /^addresses$/i });
    expect(link).toHaveAttribute('data-active', 'true');
  });

  test('renders Inbox and Sent sub-nav for each address', () => {
    renderSidebar();
    expect(screen.getAllByText('Inbox')).toHaveLength(ADDRESSES.length);
    expect(screen.getAllByText('Sent')).toHaveLength(ADDRESSES.length);
  });

  test('Inbox sub-link points to /inbox/[address]', () => {
    renderSidebar();
    const inboxLinks = screen.getAllByRole('link', { name: /^inbox$/i });
    expect(inboxLinks[0]).toHaveAttribute('href', '/inbox/hello%40example.com');
  });

  test('Sent sub-link points to /sent/[address]', () => {
    renderSidebar();
    const sentLinks = screen.getAllByRole('link', { name: /^sent$/i });
    expect(sentLinks[0]).toHaveAttribute('href', '/sent/hello%40example.com');
  });

  test('Inbox sub-link has active state when on inbox route', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    const inboxLinks = screen.getAllByRole('link', { name: /^inbox$/i });
    expect(inboxLinks[0]).toHaveAttribute('data-active', 'true');
  });

  test('Sent sub-link has active state when on sent route', () => {
    mockPathname.mockReturnValue('/sent/hello%40example.com');
    renderSidebar();
    const sentLinks = screen.getAllByRole('link', { name: /^sent$/i });
    expect(sentLinks[0]).toHaveAttribute('data-active', 'true');
  });

  test('Sent sub-link stays active when viewing a sent message detail', () => {
    mockPathname.mockReturnValue('/sent/hello%40example.com/msg-123');
    renderSidebar();
    const sentLinks = screen.getAllByRole('link', { name: /^sent$/i });
    expect(sentLinks[0]).toHaveAttribute('data-active', 'true');
  });

  test('increments unread badge when WebSocket new_message event arrives', async () => {
    renderSidebar();

    act(() => {
      wsHandler?.({
        type: 'new_message',
        address: 'info@example.com',
        message: {
          messageId: 'msg-new',
          address: 'info@example.com',
          sender: 'x@test.com',
          subject: 'New',
          receivedAt: new Date().toISOString(),
          isRead: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  test('Compose button opens compose sheet via context', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    expect(mockOpenCompose).toHaveBeenCalledTimes(1);
  });

  test('calls sign out on button click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' });
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  test('collapses email address dropdown when header is clicked again', async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.getAllByText('Inbox')).toHaveLength(ADDRESSES.length);

    const addressButton = screen.getByText('hello@example.com').closest('button');
    await user.click(addressButton!);

    expect(screen.getAllByText('Inbox')).toHaveLength(ADDRESSES.length - 1);
  });
});
