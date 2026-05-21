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
  return () => { wsHandler = null; };
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
  test('shows selected address in dropdown trigger', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
  });

  test('defaults to first address when not on a mailbox route', () => {
    renderSidebar();
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
  });

  test('shows empty state when no addresses', () => {
    renderSidebar([]);
    expect(screen.getByText(/no addresses yet/i)).toBeInTheDocument();
  });

  test('renders Compose button', () => {
    renderSidebar();
    expect(screen.getByText('Compose')).toBeInTheDocument();
  });

  test('renders folder links for the selected address', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Junk')).toBeInTheDocument();
    expect(screen.getByText('Trash')).toBeInTheDocument();
  });

  test('Inbox link points to /inbox/[selectedAddress]', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByTestId('folder-link-inbox')).toHaveAttribute('href', '/inbox/hello%40example.com');
  });

  test('Drafts link points to /drafts/[selectedAddress]', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByTestId('folder-link-drafts')).toHaveAttribute('href', '/drafts/hello%40example.com');
  });

  test('Sent link points to /sent/[selectedAddress]', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByTestId('folder-link-sent')).toHaveAttribute('href', '/sent/hello%40example.com');
  });

  test('Inbox link has active state when on inbox route', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByTestId('folder-link-inbox')).toHaveAttribute('data-active', 'true');
  });

  test('Drafts link has active state when on drafts route', () => {
    mockPathname.mockReturnValue('/drafts/hello%40example.com');
    renderSidebar();
    expect(screen.getByTestId('folder-link-drafts')).toHaveAttribute('data-active', 'true');
  });

  test('Sent link has active state when on sent route', () => {
    mockPathname.mockReturnValue('/sent/hello%40example.com');
    renderSidebar();
    expect(screen.getByTestId('folder-link-sent')).toHaveAttribute('data-active', 'true');
  });

  test('Sent link stays active when viewing a sent message detail', () => {
    mockPathname.mockReturnValue('/sent/hello%40example.com/msg-123');
    renderSidebar();
    expect(screen.getByTestId('folder-link-sent')).toHaveAttribute('data-active', 'true');
  });

  test('shows unread badge for selected address inbox count', () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('increments unread badge when WebSocket new_message event arrives', async () => {
    mockPathname.mockReturnValue('/inbox/info%40example.com');
    renderSidebar();

    act(() => {
      wsHandler?.({
        type: 'new_message',
        address: 'info@example.com',
        messageId: 'msg-new',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  test('replaces unread badge when hermes:inboxcount fires', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    renderSidebar();
    expect(screen.getByText('3')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('hermes:inboxcount', { detail: { address: 'hello@example.com', unreadCount: 7 } }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  test('Compose button calls openCompose with selected address', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    expect(mockOpenCompose).toHaveBeenCalledWith({ from: 'hello@example.com' });
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
});
