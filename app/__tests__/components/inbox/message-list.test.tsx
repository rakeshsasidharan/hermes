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

beforeEach(() => {
  global.fetch = jest.fn();
  wsHandler = null;
  mockSubscribe.mockClear();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MessageList — inbox (inbound)', () => {
  test('renders inbound message rows with from field', () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  test('falls back to sender field when from is absent', () => {
    const msg = [{ ...INBOUND_MESSAGES[0], from: undefined, sender: 'legacy@test.com' }];
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={msg} initialNextCursor={null} />);
    expect(screen.getByText('legacy@test.com')).toBeInTheDocument();
  });

  test('shows From column header', () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  test('shows unread badge for unread inbound messages', () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();
  });

  test('shows attachment icon for messages with attachments', () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    expect(screen.getByLabelText('Has attachments')).toBeInTheDocument();
  });

  test('passes direction=inbound to API on filter', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    await user.click(screen.getByRole('button', { name: /apply filter/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('direction=inbound'));
    });
  });

  test('prepends new message from WebSocket event', async () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
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
    await waitFor(() => expect(screen.getByText('carol@test.com')).toBeInTheDocument());
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('carol@test.com');
  });

  test('ignores WebSocket events for a different address', async () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    act(() => {
      wsHandler?.({
        type: 'new_message',
        address: 'other@example.com',
        message: { messageId: 'x', address: 'other@example.com', sender: 'dave@test.com', subject: 'No', receivedAt: new Date().toISOString(), isRead: false },
      });
    });
    expect(screen.queryByText('dave@test.com')).not.toBeInTheDocument();
  });

  test('does not duplicate a message already present', async () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'hello@example.com', message: { ...INBOUND_MESSAGES[0] } });
    });
    expect(screen.getAllByText('alice@test.com')).toHaveLength(1);
  });
});

describe('MessageList — sent (outbound)', () => {
  test('renders outbound rows with recipient in To column', () => {
    render(<MessageList address="hello@example.com" direction="outbound" initialMessages={OUTBOUND_MESSAGES} initialNextCursor={null} />);
    expect(screen.getByText('recipient@test.com')).toBeInTheDocument();
    expect(screen.getByText('Re: Hello')).toBeInTheDocument();
  });

  test('shows To column header', () => {
    render(<MessageList address="hello@example.com" direction="outbound" initialMessages={OUTBOUND_MESSAGES} initialNextCursor={null} />);
    expect(screen.getByText('To')).toBeInTheDocument();
  });

  test('does not show unread badge for outbound messages', () => {
    const unread = [{ ...OUTBOUND_MESSAGES[0], isRead: false }];
    render(<MessageList address="hello@example.com" direction="outbound" initialMessages={unread} initialNextCursor={null} />);
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
  });

  test('passes direction=outbound to API on pagination', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    render(<MessageList address="hello@example.com" direction="outbound" initialMessages={OUTBOUND_MESSAGES} initialNextCursor="cursor1" />);
    await user.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('direction=outbound'));
    });
  });

  test('does not subscribe to WebSocket events in sent view', () => {
    render(<MessageList address="hello@example.com" direction="outbound" initialMessages={OUTBOUND_MESSAGES} initialNextCursor={null} />);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('MessageList — shared', () => {
  test('shows empty state when no messages', () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={[]} initialNextCursor={null} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  test('shows Load more button when nextCursor is set', () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor="cursor123" />);
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  test('does not show Load more when no nextCursor', () => {
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  test('navigates to /inbox/[address]/[messageId] for inbound', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });
    const user = userEvent.setup();
    render(<MessageList address="hello@example.com" direction="inbound" initialMessages={INBOUND_MESSAGES} initialNextCursor={null} />);
    await user.click(screen.getByText('Hello'));
    expect(mockPush).toHaveBeenCalledWith('/inbox/hello%40example.com/msg-1');
  });

  test('navigates to /sent/[address]/[messageId] for outbound', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });
    const user = userEvent.setup();
    render(<MessageList address="hello@example.com" direction="outbound" initialMessages={OUTBOUND_MESSAGES} initialNextCursor={null} />);
    await user.click(screen.getByText('Re: Hello'));
    expect(mockPush).toHaveBeenCalledWith('/sent/hello%40example.com/msg-out');
  });
});
