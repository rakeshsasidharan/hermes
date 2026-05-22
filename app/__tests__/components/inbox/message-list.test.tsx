import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageList } from '@/components/inbox/message-list';
import type { WsNewMessageEvent } from '@/lib/ws';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
  usePathname: jest.fn().mockReturnValue('/inbox/hello%40example.com'),
}));

let wsHandler: ((event: WsNewMessageEvent) => void) | null = null;
const mockSubscribe = jest.fn((handler: (event: WsNewMessageEvent) => void) => {
  wsHandler = handler;
  return () => { wsHandler = null; };
});

jest.mock('@/components/ws-context', () => ({
  useWs: () => ({ subscribe: mockSubscribe }),
}));

const INBOUND_MESSAGES = [
  {
    messageId: 'msg-1',
    address: 'hello@example.com',
    from: 'alice@test.com',
    direction: 'inbound' as const,
    subject: 'Hello',
    receivedAt: '2026-01-01T10:00:00Z',
    isRead: true,
    attachments: [],
  },
  {
    messageId: 'msg-2',
    address: 'hello@example.com',
    from: 'bob@test.com',
    direction: 'inbound' as const,
    subject: 'World',
    receivedAt: '2026-01-02T10:00:00Z',
    isRead: false,
    attachments: [{ filename: 'file.pdf', s3Key: 'key' }],
  },
];

const OUTBOUND_MESSAGES = [
  {
    messageId: 'msg-out',
    address: 'hello@example.com',
    from: 'hello@example.com',
    to: 'recipient@test.com',
    direction: 'outbound' as const,
    subject: 'Re: Hello',
    receivedAt: '2026-01-03T10:00:00Z',
    isRead: true,
    attachments: [],
  },
];

const DEFAULT_INBOUND_PROPS = {
  address: 'hello@example.com',
  direction: 'inbound' as const,
  initialMessages: INBOUND_MESSAGES,
  initialNextCursor: null,
  folderLabel: 'Inbox',
};

const DEFAULT_OUTBOUND_PROPS = {
  address: 'hello@example.com',
  direction: 'outbound' as const,
  initialMessages: OUTBOUND_MESSAGES,
  initialNextCursor: null,
  folderLabel: 'Sent',
};

beforeEach(() => {
  global.fetch = jest.fn();
  wsHandler = null;
  mockSubscribe.mockClear();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MessageList — inbox (inbound)', () => {
  test('renders folder label in header', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(screen.getByText('Inbox')).toBeInTheDocument();
  });

  test('renders inbound message rows with sender name', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  test('renders message subjects', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  test('falls back to sender field when from is absent', () => {
    const msg = [{ ...INBOUND_MESSAGES[0], from: undefined, sender: 'legacy@test.com' }];
    render(<MessageList {...DEFAULT_INBOUND_PROPS} initialMessages={msg} />);
    expect(screen.getByText('legacy@test.com')).toBeInTheDocument();
  });

  test('shows unread badge for unread inbound messages', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();
  });

  test('prepends new message from WebSocket event by fetching the full record', async () => {
    const wsMessage = {
      messageId: 'msg-ws',
      address: 'hello@example.com',
      from: 'carol@test.com',
      sender: 'carol@test.com',
      subject: 'Real-time',
      receivedAt: new Date().toISOString(),
      isRead: false,
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ message: wsMessage }),
    });
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'hello@example.com', messageId: 'msg-ws' });
    });
    await waitFor(() => expect(screen.getByText('carol@test.com')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith('/api/messages/msg-ws');
  });

  test('ignores WebSocket events for a different address', async () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'other@example.com', messageId: 'x' });
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('dave@test.com')).not.toBeInTheDocument();
  });

  test('does not duplicate a message already present', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ message: INBOUND_MESSAGES[0] }),
    });
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'hello@example.com', messageId: 'msg-1' });
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText('alice@test.com')).toHaveLength(1);
  });
});

describe('MessageList — sent (outbound)', () => {
  test('renders folder label in header', () => {
    render(<MessageList {...DEFAULT_OUTBOUND_PROPS} />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  test('renders outbound rows with recipient name', () => {
    render(<MessageList {...DEFAULT_OUTBOUND_PROPS} />);
    expect(screen.getByText('recipient@test.com')).toBeInTheDocument();
    expect(screen.getByText('Re: Hello')).toBeInTheDocument();
  });

  test('does not show unread badge for outbound messages', () => {
    const unread = [{ ...OUTBOUND_MESSAGES[0], isRead: false }];
    render(<MessageList {...DEFAULT_OUTBOUND_PROPS} initialMessages={unread} />);
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
  });

  test('passes direction=outbound to API on pagination', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    render(<MessageList {...DEFAULT_OUTBOUND_PROPS} initialNextCursor="cursor1" />);
    await user.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('direction=outbound'));
    });
  });

  test('does not subscribe to WebSocket events in sent view', () => {
    render(<MessageList {...DEFAULT_OUTBOUND_PROPS} />);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('MessageList — hermes:readstatus event', () => {
  test('clears unread badge when hermes:readstatus fires with isRead=true', async () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('hermes:readstatus', { detail: { messageId: 'msg-2', isRead: true } }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
    });
  });

  test('restores unread badge when hermes:readstatus fires with isRead=false', async () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('hermes:readstatus', { detail: { messageId: 'msg-1', isRead: false } }),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByLabelText('Unread')).toHaveLength(2);
    });
  });

  test('WS message from field is displayed after fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          messageId: 'msg-ws2',
          address: 'hello@example.com',
          from: 'ws-sender@test.com',
          subject: 'WS Subject',
          receivedAt: new Date().toISOString(),
          isRead: false,
        },
      }),
    });
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'hello@example.com', messageId: 'msg-ws2' });
    });
    await waitFor(() => expect(screen.getByText('ws-sender@test.com')).toBeInTheDocument());
  });
});

describe('MessageList — hermes:inboxcount', () => {
  test('dispatches hermes:inboxcount on mount with unread count', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('hermes:inboxcount', handler);
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].detail).toEqual({ address: 'hello@example.com', unreadCount: 1 });
    window.removeEventListener('hermes:inboxcount', handler);
  });

  test('does not dispatch hermes:inboxcount for outbound direction', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('hermes:inboxcount', handler);
    render(<MessageList {...DEFAULT_OUTBOUND_PROPS} />);
    expect(events).toHaveLength(0);
    window.removeEventListener('hermes:inboxcount', handler);
  });

  test('updates hermes:inboxcount when hermes:readstatus marks a message read', async () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('hermes:inboxcount', handler);
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent('hermes:readstatus', { detail: { messageId: 'msg-2', isRead: true } }),
      );
    });
    await waitFor(() => {
      const last = events[events.length - 1];
      expect(last.detail).toEqual({ address: 'hello@example.com', unreadCount: 0 });
    });
    window.removeEventListener('hermes:inboxcount', handler);
  });
});

describe('MessageList — card layout', () => {
  test('renders message snippet when provided', () => {
    const msgs = [{ ...INBOUND_MESSAGES[0], snippet: 'This is a preview of the email body' }];
    render(<MessageList {...DEFAULT_INBOUND_PROPS} initialMessages={msgs} />);
    expect(screen.getByText('This is a preview of the email body')).toBeInTheDocument();
  });

  test('does not render snippet element when snippet is absent', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} initialMessages={[{ ...INBOUND_MESSAGES[0], snippet: undefined }]} />);
    expect(screen.queryByTestId('message-snippet')).not.toBeInTheDocument();
  });

  test('each message row has rounded card styling', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    const row = screen.getByTestId('message-row-msg-1');
    expect(row.className).toContain('rounded-lg');
  });
});

describe('MessageList — shared', () => {
  test('shows empty state when no messages', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} initialMessages={[]} />);
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
  });

  test('shows Load more button when nextCursor is set', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} initialNextCursor="cursor123" />);
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  test('does not show Load more when no nextCursor', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  test('shows All mail and Unread filter tabs', () => {
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    expect(screen.getByTestId('filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-unread')).toBeInTheDocument();
  });

  test('Unread filter hides read messages', async () => {
    const user = userEvent.setup();
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    await user.click(screen.getByTestId('filter-unread'));
    expect(screen.queryByText('alice@test.com')).not.toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  test('navigates to /inbox/[address]/[messageId] for inbound', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });
    const user = userEvent.setup();
    render(<MessageList {...DEFAULT_INBOUND_PROPS} />);
    await user.click(screen.getByTestId('message-row-msg-1'));
    expect(mockPush).toHaveBeenCalledWith('/inbox/hello%40example.com/msg-1');
  });

  test('navigates to /sent/[address]/[messageId] for outbound', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });
    const user = userEvent.setup();
    render(<MessageList {...DEFAULT_OUTBOUND_PROPS} />);
    await user.click(screen.getByTestId('message-row-msg-out'));
    expect(mockPush).toHaveBeenCalledWith('/sent/hello%40example.com/msg-out');
  });
});
