import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageList } from '@/components/inbox/message-list';
import type { WsNewMessageEvent } from '@/lib/ws';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
}));

jest.mock('@/components/inbox/filter-bar', () => ({
  FilterBar: ({ onFilter }: { onFilter: (f: object) => void }) => (
    <button onClick={() => onFilter({ sender: 'alice', subject: '', from: '', to: '' })}>
      Apply filter
    </button>
  ),
}));

let wsHandler: ((event: WsNewMessageEvent) => void) | null = null;
const mockSubscribe = jest.fn((handler: (event: WsNewMessageEvent) => void) => {
  wsHandler = handler;
  return () => { wsHandler = null; };
});

jest.mock('@/components/ws-context', () => ({
  useWs: () => ({ subscribe: mockSubscribe }),
}));

const MESSAGES = [
  {
    messageId: 'msg-1',
    address: 'hello@example.com',
    sender: 'alice@test.com',
    direction: 'inbound' as const,
    subject: 'Hello',
    receivedAt: '2026-01-01T10:00:00Z',
    isRead: true,
    attachments: [],
  },
  {
    messageId: 'msg-2',
    address: 'hello@example.com',
    sender: 'bob@test.com',
    direction: 'inbound' as const,
    subject: 'World',
    receivedAt: '2026-01-02T10:00:00Z',
    isRead: false,
    attachments: [{ filename: 'file.pdf', s3Key: 'key' }],
  },
];

const OUTBOUND_MESSAGE = {
  messageId: 'msg-out',
  address: 'hello@example.com',
  from: 'hello@example.com',
  to: 'recipient@test.com',
  direction: 'outbound' as const,
  subject: 'Re: Hello',
  receivedAt: '2026-01-03T10:00:00Z',
  isRead: true,
  attachments: [],
};

beforeEach(() => {
  global.fetch = jest.fn();
  wsHandler = null;
  mockSubscribe.mockClear();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MessageList', () => {
  test('renders message rows', () => {
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  test('shows attachment icon for messages with attachments', () => {
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);
    expect(screen.getByLabelText('Has attachments')).toBeInTheDocument();
  });

  test('shows empty state when no messages', () => {
    render(<MessageList address="hello@example.com" initialMessages={[]} initialNextCursor={null} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  test('shows Load more button when nextCursor is set', () => {
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor="cursor123" />);
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  test('does not show Load more when no nextCursor', () => {
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  test('fetches more messages on Load more click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ messageId: 'msg-3', address: 'hello@example.com', sender: 'carol@test.com', subject: 'More', receivedAt: '2026-01-03T10:00:00Z', isRead: true, attachments: [] }], nextCursor: null }),
    });
    const user = userEvent.setup();
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor="cursor123" />);

    await user.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('carol@test.com')).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('cursor=cursor123'));
  });

  test('fetches filtered messages when filter applied', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);

    await user.click(screen.getByRole('button', { name: /apply filter/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sender=alice'));
    });
  });

  test('prepends new message from WebSocket event for the same address', async () => {
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);

    act(() => {
      wsHandler?.({
        type: 'new_message',
        address: 'hello@example.com',
        message: {
          messageId: 'msg-ws',
          address: 'hello@example.com',
          sender: 'carol@test.com',
          subject: 'Real-time',
          receivedAt: new Date().toISOString(),
          isRead: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('carol@test.com')).toBeInTheDocument();
    });
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('carol@test.com');
  });

  test('ignores WebSocket events for a different address', async () => {
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);

    act(() => {
      wsHandler?.({
        type: 'new_message',
        address: 'other@example.com',
        message: {
          messageId: 'msg-other',
          address: 'other@example.com',
          sender: 'dave@test.com',
          subject: 'Wrong inbox',
          receivedAt: new Date().toISOString(),
          isRead: false,
        },
      });
    });

    expect(screen.queryByText('dave@test.com')).not.toBeInTheDocument();
  });

  test('does not duplicate a message already present', async () => {
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);

    act(() => {
      wsHandler?.({
        type: 'new_message',
        address: 'hello@example.com',
        message: { ...MESSAGES[0] },
      });
    });

    expect(screen.getAllByText('alice@test.com')).toHaveLength(1);
  });

  test('shows Sent badge and recipient for outbound messages', () => {
    render(<MessageList address="hello@example.com" initialMessages={[OUTBOUND_MESSAGE]} initialNextCursor={null} />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('recipient@test.com')).toBeInTheDocument();
    expect(screen.getByText('Re: Hello')).toBeInTheDocument();
  });

  test('does not show unread badge for outbound messages', () => {
    const unreadOutbound = { ...OUTBOUND_MESSAGE, isRead: false };
    render(<MessageList address="hello@example.com" initialMessages={[unreadOutbound]} initialNextCursor={null} />);
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
  });

  test('navigates to message detail on row click', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });

    const user = userEvent.setup();
    render(<MessageList address="hello@example.com" initialMessages={MESSAGES} initialNextCursor={null} />);

    await user.click(screen.getByText('Hello'));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('msg-1'));
  });
});
