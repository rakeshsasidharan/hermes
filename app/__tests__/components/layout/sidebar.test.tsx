import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppSidebar } from '@/components/layout/sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { WsNewMessageEvent } from '@/lib/ws';

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue('/');

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

jest.mock('@/lib/navigation-guard', () => ({
  isGuardActive: jest.fn(() => false),
  tryNavigate: jest.fn((fn: () => void) => fn()),
}));

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

const mockSidebarDispatch = jest.fn((action) => action);
jest.mock('react-redux', () => ({
  useDispatch: () => mockSidebarDispatch,
}));

const mockSidebarInvalidateTags = jest.fn(() => ({ type: 'test/invalidate' }));

jest.mock('@/store/api', () => ({
  apiSlice: {
    util: {
      invalidateTags: (...args: unknown[]) => mockSidebarInvalidateTags(...args),
    },
  },
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
  mockSidebarDispatch.mockClear();
  mockSidebarInvalidateTags.mockClear();
  wsHandler = null;
  mockSubscribe.mockClear();
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

  test('shows unread badge from server-rendered initial count', () => {
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

  test('Compose button shows spinner and is disabled while creating draft', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    let resolveFetch!: (v: unknown) => void;
    (global.fetch as jest.Mock).mockImplementationOnce(
      () => new Promise((res) => { resolveFetch = res; }),
    );
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    expect(screen.getByTestId('compose-button')).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({ drafts: [] }) });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ draftId: 'new-draft-id' }),
    });
  });

  test('Compose button navigates to existing new draft when one already exists', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ drafts: [{ draftId: 'existing-draft', inReplyToMessageId: undefined }] }),
    });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/drafts/${encodeURIComponent('hello@example.com')}/existing-draft`,
      );
    });
    expect(global.fetch).not.toHaveBeenCalledWith('/api/drafts', expect.objectContaining({ method: 'POST' }));
  });

  test('Compose button creates new draft when existing drafts all have saved content', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          drafts: [{ draftId: 'saved-draft', subject: 'Hello world' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ draftId: 'new-draft-id' }) });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/drafts',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        `/drafts/${encodeURIComponent('hello@example.com')}/new-draft-id`,
      );
    });
  });

  test('Compose button creates new draft when no existing new draft found', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ drafts: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ draftId: 'new-draft-id' }) });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/drafts',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        `/drafts/${encodeURIComponent('hello@example.com')}/new-draft-id`,
      );
    });
  });

  test('Compose button invalidates Draft cache after creating new draft', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ drafts: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ draftId: 'new-draft-id' }) });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    await waitFor(() => {
      expect(mockSidebarInvalidateTags).toHaveBeenCalledWith(['Draft']);
      expect(mockSidebarDispatch).toHaveBeenCalledWith({ type: 'test/invalidate' });
    });
  });

  test('Compose button does not invalidate Draft cache when opening existing draft', async () => {
    mockPathname.mockReturnValue('/inbox/hello%40example.com');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ drafts: [{ draftId: 'existing-draft', inReplyToMessageId: undefined }] }),
    });
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByTestId('compose-button'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/drafts/${encodeURIComponent('hello@example.com')}/existing-draft`,
      );
    });
    expect(mockSidebarInvalidateTags).not.toHaveBeenCalled();
  });

  test('Compose button is disabled when on a draft detail route', () => {
    mockPathname.mockReturnValue('/drafts/hello%40example.com/some-draft-id');
    renderSidebar();
    expect(screen.getByTestId('compose-button')).toBeDisabled();
  });

  describe('address dropdown sorting', () => {
    test('sorts addresses by domain alphabetically', async () => {
      const user = userEvent.setup();
      const addresses = [
        { email: 'carol@banana.com', domain: 'banana.com', status: 'active' },
        { email: 'alice@apple.com', domain: 'apple.com', status: 'active' },
      ];
      renderSidebar(addresses);
      await user.click(screen.getByRole('button', { name: /alice@apple.com/i }));
      const items = screen.getAllByRole('menuitem');
      expect(items[0]).toHaveTextContent('alice@apple.com');
      expect(items[1]).toHaveTextContent('carol@banana.com');
    });

    test('sorts addresses by local part within the same domain', async () => {
      const user = userEvent.setup();
      const addresses = [
        { email: 'bob@apple.com', domain: 'apple.com', status: 'active' },
        { email: 'alice@apple.com', domain: 'apple.com', status: 'active' },
      ];
      renderSidebar(addresses);
      await user.click(screen.getByRole('button', { name: /alice@apple.com/i }));
      const items = screen.getAllByRole('menuitem');
      expect(items[0]).toHaveTextContent('alice@apple.com');
      expect(items[1]).toHaveTextContent('bob@apple.com');
    });

    test('cross-domain and cross-local sort combined', async () => {
      const user = userEvent.setup();
      const addresses = [
        { email: 'carol@banana.com', domain: 'banana.com', status: 'active' },
        { email: 'bob@apple.com', domain: 'apple.com', status: 'active' },
        { email: 'alice@apple.com', domain: 'apple.com', status: 'active' },
      ];
      renderSidebar(addresses);
      await user.click(screen.getByRole('button', { name: /alice@apple.com/i }));
      const items = screen.getAllByRole('menuitem');
      expect(items[0]).toHaveTextContent('alice@apple.com');
      expect(items[1]).toHaveTextContent('bob@apple.com');
      expect(items[2]).toHaveTextContent('carol@banana.com');
    });
  });

  describe('address dropdown unread badges', () => {
    test('shows unread badge for address with unreadCount > 0', async () => {
      const user = userEvent.setup();
      renderSidebar(ADDRESSES);
      await user.click(screen.getByRole('button', { name: /hello@example.com/i }));
      const items = screen.getAllByRole('menuitem');
      const helloItem = items.find((el) => el.textContent?.includes('hello@example.com'));
      expect(helloItem).toHaveTextContent('3');
    });

    test('does not show unread badge for address with unreadCount 0', async () => {
      const user = userEvent.setup();
      renderSidebar(ADDRESSES);
      await user.click(screen.getByRole('button', { name: /hello@example.com/i }));
      const items = screen.getAllByRole('menuitem');
      const infoItem = items.find((el) => el.textContent?.includes('info@example.com'));
      expect(infoItem).not.toHaveTextContent(/^\d+$/);
    });

    test('does not show unread badge for address with absent unreadCount', async () => {
      const user = userEvent.setup();
      const addresses = [
        { email: 'hello@example.com', domain: 'example.com', status: 'active' },
      ];
      renderSidebar(addresses);
      await user.click(screen.getByRole('button', { name: /hello@example.com/i }));
      const items = screen.getAllByRole('menuitem');
      expect(items[0]).not.toHaveTextContent(/^\d+$/);
    });
  });

  describe('address switch navigation', () => {
    test('always navigates to inbox of new address regardless of current folder', async () => {
      mockPathname.mockReturnValue('/sent/hello%40example.com');
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByRole('button', { name: /hello@example.com/i }));
      const items = screen.getAllByRole('menuitem');
      const infoItem = items.find((el) => el.textContent?.includes('info@example.com'));
      await user.click(infoItem!);
      expect(mockPush).toHaveBeenCalledWith(`/inbox/${encodeURIComponent('info@example.com')}`);
    });

    test('navigates to inbox when switching from inbox of another address', async () => {
      mockPathname.mockReturnValue('/inbox/hello%40example.com');
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByRole('button', { name: /hello@example.com/i }));
      const items = screen.getAllByRole('menuitem');
      const infoItem = items.find((el) => el.textContent?.includes('info@example.com'));
      await user.click(infoItem!);
      expect(mockPush).toHaveBeenCalledWith(`/inbox/${encodeURIComponent('info@example.com')}`);
    });

    test('navigates to inbox when switching from drafts folder', async () => {
      mockPathname.mockReturnValue('/drafts/hello%40example.com');
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByRole('button', { name: /hello@example.com/i }));
      const items = screen.getAllByRole('menuitem');
      const infoItem = items.find((el) => el.textContent?.includes('info@example.com'));
      await user.click(infoItem!);
      expect(mockPush).toHaveBeenCalledWith(`/inbox/${encodeURIComponent('info@example.com')}`);
    });
  });

  describe('options dropdown', () => {
    test('shows Options trigger button', () => {
      renderSidebar();
      const trigger = screen.getByTestId('profile-trigger');
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent('Options');
    });

    test('dropdown contains Settings link and sign out', async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByTestId('profile-trigger'));
      expect(screen.getByTestId('profile-nav-settings')).toBeInTheDocument();
      expect(screen.getByTestId('profile-nav-signout')).toBeInTheDocument();
    });

    test('Settings nav link points to /settings', async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByTestId('profile-trigger'));
      expect(screen.getByTestId('profile-nav-settings')).toHaveAttribute('href', '/settings');
    });

    test('active page item is highlighted', async () => {
      mockPathname.mockReturnValue('/settings');
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByTestId('profile-trigger'));
      expect(screen.getByTestId('profile-nav-settings')).toHaveClass('bg-accent');
    });

    test('navigates to /login immediately and fires signout API in background', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      renderSidebar();
      await user.click(screen.getByTestId('profile-trigger'));
      await user.click(screen.getByTestId('profile-nav-signout'));
      expect(mockPush).toHaveBeenCalledWith('/login');
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' });
    });
  });
});
