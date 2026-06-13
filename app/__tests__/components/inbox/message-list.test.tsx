import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageList } from '@/components/inbox/message-list';
import type { WsNewMessageEvent } from '@/lib/ws';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({ push: jest.fn(), refresh: jest.fn() }),
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

// Module-level shared state for RTK mock
let mockMessages: ReturnType<typeof buildMessages>;
let mockNextCursor: string | null = null;
let triggerRender: (() => void) | null = null;

const mockMoveMessage = jest.fn();
const mockMarkReadStatus = jest.fn();
const mockDeleteMessage = jest.fn();
const mockTriggerLoadMore = jest.fn();
const mockDispatch = jest.fn((action: unknown) => action);

const mockUpdateQueryData = jest.fn(
  (_endpoint: string, _args: unknown, updater: (d: { messages: typeof INBOUND_MESSAGES; nextCursor: string | null }) => void) => {
    const draft = { messages: mockMessages, nextCursor: mockNextCursor };
    updater(draft as unknown as { messages: typeof INBOUND_MESSAGES; nextCursor: string | null });
    mockMessages = draft.messages;
    mockNextCursor = draft.nextCursor;
    triggerRender?.();
    return { type: 'mock/patch', undo: jest.fn() };
  },
);

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock('@/store/api', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');

  function useGetMessagesQueryMock() {
    const [, setTick] = React.useState(0);
    // Capture the forceUpdate function synchronously during render
    triggerRender = () => setTick((n: number) => n + 1);
    return { data: { messages: mockMessages, nextCursor: mockNextCursor }, isFetching: false };
  }

  return {
    useGetMessagesQuery: useGetMessagesQueryMock,
    useLazyGetMessagesQuery: jest.fn(() => [mockTriggerLoadMore, { isFetching: false }]),
    useMarkReadStatusMutation: jest.fn(() => [mockMarkReadStatus]),
    useMoveMessageMutation: jest.fn(() => [mockMoveMessage]),
    useDeleteMessageMutation: jest.fn(() => [mockDeleteMessage]),
    apiSlice: {
      util: {
        updateQueryData: (...args: Parameters<typeof mockUpdateQueryData>) =>
          mockUpdateQueryData(...args),
      },
    },
  };
});

function buildMessages<T extends readonly unknown[]>(arr: T) { return arr as unknown as typeof INBOUND_MESSAGES; }

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

type MessageListProps = {
  address: string;
  direction: 'inbound' | 'outbound';
  folder?: 'inbox' | 'junk' | 'trash';
  initialMessages: typeof INBOUND_MESSAGES;
  initialNextCursor: string | null;
  folderLabel: string;
};

function setupMutationMocks() {
  mockMoveMessage.mockImplementation(
    async ({ messageId, targetFolder, fromAddress, fromFolder, fromDirection }: {
      messageId: string; targetFolder: string; fromAddress: string;
      fromFolder?: string; fromDirection?: string;
    }) => {
      const savedMessages = [...mockMessages];
      mockUpdateQueryData(
        'getMessages',
        { address: fromAddress, folder: fromFolder, direction: fromDirection },
        (draft) => {
          draft.messages = (draft.messages as typeof INBOUND_MESSAGES).filter(
            (m) => m.messageId !== messageId,
          ) as typeof INBOUND_MESSAGES;
        },
      );
      const res = await (global.fetch as jest.Mock)(
        `/api/messages/${encodeURIComponent(messageId)}`,
        { method: 'PATCH', body: JSON.stringify({ folder: targetFolder }) },
      );
      if (!(res as { ok: boolean }).ok) {
        mockMessages = savedMessages;
        triggerRender?.();
        return { error: {} };
      }
      return { data: {} };
    },
  );

  mockMarkReadStatus.mockImplementation(
    async ({ messageId, isRead, address, folder, direction }: {
      messageId: string; isRead: boolean; address: string;
      folder?: string; direction?: string;
    }) => {
      const savedMessages = mockMessages.map((m) => ({ ...m }));
      mockUpdateQueryData(
        'getMessages',
        { address, folder, direction },
        (draft) => {
          const m = (draft.messages as typeof INBOUND_MESSAGES).find((msg) => msg.messageId === messageId);
          if (m) (m as { isRead: boolean }).isRead = isRead;
        },
      );
      const res = await (global.fetch as jest.Mock)(
        `/api/messages/${encodeURIComponent(messageId)}`,
        { method: 'PATCH', body: JSON.stringify({ isRead }) },
      );
      if (!(res as { ok: boolean }).ok) {
        mockMessages = savedMessages;
        triggerRender?.();
        return { error: {} };
      }
      return { data: {} };
    },
  );

  mockDeleteMessage.mockImplementation(
    async ({ messageId, address, folder, direction }: {
      messageId: string; address: string; folder?: string; direction?: string;
    }) => {
      const savedMessages = [...mockMessages];
      mockUpdateQueryData(
        'getMessages',
        { address, folder, direction },
        (draft) => {
          draft.messages = (draft.messages as typeof INBOUND_MESSAGES).filter(
            (m) => m.messageId !== messageId,
          ) as typeof INBOUND_MESSAGES;
        },
      );
      const res = await (global.fetch as jest.Mock)(
        `/api/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' },
      );
      if (!(res as { ok: boolean }).ok) {
        mockMessages = savedMessages;
        triggerRender?.();
        return { error: {} };
      }
      return { data: {} };
    },
  );

  mockTriggerLoadMore.mockImplementation(
    async ({ address, folder, direction, cursor }: {
      address: string; folder?: string; direction?: string; cursor?: string;
    }) => {
      const params = new URLSearchParams({ address });
      if (folder) params.set('folder', folder);
      else if (direction) params.set('direction', direction);
      if (cursor) params.set('cursor', cursor);
      const res = await (global.fetch as jest.Mock)(`/api/messages?${params.toString()}`);
      if (res && (res as { ok: boolean }).ok) {
        const data = await (res as { json: () => Promise<{ messages: typeof INBOUND_MESSAGES; nextCursor: string | null }> }).json();
        mockMessages = [...mockMessages, ...data.messages] as typeof INBOUND_MESSAGES;
        mockNextCursor = data.nextCursor;
        triggerRender?.();
      }
    },
  );
}

function renderWithMessages(
  props: MessageListProps,
  messages: typeof INBOUND_MESSAGES = INBOUND_MESSAGES,
  nextCursor: string | null = null,
) {
  mockMessages = messages.map((m) => ({ ...m })) as typeof INBOUND_MESSAGES;
  mockNextCursor = nextCursor;
  return render(<MessageList {...props} />);
}

beforeEach(() => {
  mockMessages = INBOUND_MESSAGES.map((m) => ({ ...m })) as typeof INBOUND_MESSAGES;
  mockNextCursor = null;
  triggerRender = null;
  global.fetch = jest.fn();
  wsHandler = null;
  mockSubscribe.mockClear();
  mockDispatch.mockClear();
  mockUpdateQueryData.mockClear();
  setupMutationMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MessageList — inbox (inbound)', () => {
  test('renders folder label in header', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByText('Inbox')).toBeInTheDocument();
  });

  test('renders inbound message rows with sender name', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  test('renders message subjects', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  test('falls back to sender field when from is absent', () => {
    const msg = [{ ...INBOUND_MESSAGES[0], from: undefined, sender: 'legacy@test.com' }];
    renderWithMessages(DEFAULT_INBOUND_PROPS, msg as typeof INBOUND_MESSAGES);
    expect(screen.getByText('legacy@test.com')).toBeInTheDocument();
  });

  test('shows unread badge for unread inbound messages', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
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
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'hello@example.com', messageId: 'msg-ws' });
    });
    await waitFor(() => expect(screen.getByText('carol@test.com')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith('/api/messages/msg-ws');
  });

  test('ignores WebSocket events for a different address', async () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
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
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'hello@example.com', messageId: 'msg-1' });
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getAllByText('alice@test.com')).toHaveLength(1);
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
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    act(() => {
      wsHandler?.({ type: 'new_message', address: 'hello@example.com', messageId: 'msg-ws2' });
    });
    await waitFor(() => expect(screen.getByText('ws-sender@test.com')).toBeInTheDocument());
  });
});

describe('MessageList — sent (outbound)', () => {
  test('renders folder label in header', () => {
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, OUTBOUND_MESSAGES);
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  test('renders outbound rows with recipient name', () => {
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, OUTBOUND_MESSAGES);
    expect(screen.getByText('recipient@test.com')).toBeInTheDocument();
    expect(screen.getByText('Re: Hello')).toBeInTheDocument();
  });

  test('does not show unread badge for outbound messages', () => {
    const unread = [{ ...OUTBOUND_MESSAGES[0], isRead: false }];
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, unread as typeof INBOUND_MESSAGES);
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
  });

  test('passes direction=outbound to API on pagination', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, OUTBOUND_MESSAGES, 'cursor1');
    await user.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('direction=outbound'));
    });
  });

  test('does not subscribe to WebSocket events in sent view', () => {
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, OUTBOUND_MESSAGES);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('MessageList — folder prop (junk)', () => {
  const JUNK_PROPS: MessageListProps = {
    address: 'hello@example.com',
    direction: 'inbound',
    folder: 'junk',
    initialMessages: INBOUND_MESSAGES,
    initialNextCursor: null,
    folderLabel: 'Junk',
  };

  test('renders Junk folder label', () => {
    renderWithMessages(JUNK_PROPS);
    expect(screen.getByText('Junk')).toBeInTheDocument();
  });

  test('navigates to /junk/[address]/[messageId] on row click', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush, refresh: jest.fn() });
    const user = userEvent.setup();
    renderWithMessages(JUNK_PROPS);
    await user.click(screen.getByTestId('message-row-msg-1'));
    expect(mockPush).toHaveBeenCalledWith('/junk/hello%40example.com/msg-1');
  });

  test('passes folder=junk to API on pagination', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    renderWithMessages({ ...JUNK_PROPS, initialNextCursor: 'cursor1' }, INBOUND_MESSAGES, 'cursor1');
    await user.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('folder=junk'));
    });
  });

  test('does not subscribe to WebSocket events for junk folder', () => {
    renderWithMessages(JUNK_PROPS);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('MessageList — folder prop (trash)', () => {
  const TRASH_PROPS: MessageListProps = {
    address: 'hello@example.com',
    direction: 'inbound',
    folder: 'trash',
    initialMessages: INBOUND_MESSAGES,
    initialNextCursor: null,
    folderLabel: 'Trash',
  };

  test('renders Trash folder label', () => {
    renderWithMessages(TRASH_PROPS);
    expect(screen.getByText('Trash')).toBeInTheDocument();
  });

  test('navigates to /trash/[address]/[messageId] on row click', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush, refresh: jest.fn() });
    const user = userEvent.setup();
    renderWithMessages(TRASH_PROPS);
    await user.click(screen.getByTestId('message-row-msg-1'));
    expect(mockPush).toHaveBeenCalledWith('/trash/hello%40example.com/msg-1');
  });

  test('passes folder=trash to API on pagination', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], nextCursor: null }),
    });
    const user = userEvent.setup();
    renderWithMessages({ ...TRASH_PROPS, initialNextCursor: 'cursor1' }, INBOUND_MESSAGES, 'cursor1');
    await user.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('folder=trash'));
    });
  });

  test('does not subscribe to WebSocket events for trash folder', () => {
    renderWithMessages(TRASH_PROPS);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('MessageList — card layout', () => {
  test('renders message snippet when provided', () => {
    const msgs = [{ ...INBOUND_MESSAGES[0], snippet: 'This is a preview of the email body' }];
    renderWithMessages(DEFAULT_INBOUND_PROPS, msgs as typeof INBOUND_MESSAGES);
    expect(screen.getByText('This is a preview of the email body')).toBeInTheDocument();
  });

  test('does not render snippet element when snippet is absent', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS, [{ ...INBOUND_MESSAGES[0], snippet: undefined }] as typeof INBOUND_MESSAGES);
    expect(screen.queryByTestId('message-snippet')).not.toBeInTheDocument();
  });

  test('each message row has rounded card styling', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    const row = screen.getByTestId('message-row-msg-1');
    expect(row.className).toContain('rounded-lg');
  });
});

describe('MessageList — shared', () => {
  test('shows empty state when no messages', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS, []);
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
  });

  test('shows Load more button when nextCursor is set', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS, INBOUND_MESSAGES, 'cursor123');
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  test('does not show Load more when no nextCursor', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  test('shows All mail and Unread filter tabs', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByTestId('filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-unread')).toBeInTheDocument();
  });

  test('Unread filter hides read messages', async () => {
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    await user.click(screen.getByTestId('filter-unread'));
    expect(screen.queryByText('alice@test.com')).not.toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  test('navigates to /inbox/[address]/[messageId] for inbound', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush, refresh: jest.fn() });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    await user.click(screen.getByTestId('message-row-msg-1'));
    expect(mockPush).toHaveBeenCalledWith('/inbox/hello%40example.com/msg-1');
  });

  test('navigates to /sent/[address]/[messageId] for outbound', async () => {
    const { useRouter } = require('next/navigation');
    const mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush, refresh: jest.fn() });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, OUTBOUND_MESSAGES);
    await user.click(screen.getByTestId('message-row-msg-out'));
    expect(mockPush).toHaveBeenCalledWith('/sent/hello%40example.com/msg-out');
  });

  test('optimistically clears unread badge when clicking an unread inbox message', async () => {
    const { useRouter } = require('next/navigation');
    useRouter.mockReturnValue({ push: jest.fn(), refresh: jest.fn() });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();
    await user.click(screen.getByTestId('message-row-msg-2'));
    await waitFor(() => {
      expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
    });
  });

  test('does not optimistically clear unread badge for outbound messages', async () => {
    const { useRouter } = require('next/navigation');
    useRouter.mockReturnValue({ push: jest.fn(), refresh: jest.fn() });
    const unreadOutbound = [{ ...OUTBOUND_MESSAGES[0], isRead: false }];
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, unreadOutbound as typeof INBOUND_MESSAGES);
    await user.click(screen.getByTestId('message-row-msg-out'));
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
  });
});

describe('MessageList — bulk action toolbar', () => {
  test('renders bulk action toolbar with select-all checkbox', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete-button')).toBeInTheDocument();
  });

  test('inbox shows mark read and mark unread buttons', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByTestId('bulk-mark-read-button')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-mark-unread-button')).toBeInTheDocument();
  });

  test('sent folder does not show mark read or mark unread buttons', () => {
    renderWithMessages(DEFAULT_OUTBOUND_PROPS, OUTBOUND_MESSAGES);
    expect(screen.queryByTestId('bulk-mark-read-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-mark-unread-button')).not.toBeInTheDocument();
  });

  test('junk folder does not show junk button', () => {
    renderWithMessages({
      address: 'hello@example.com',
      direction: 'inbound',
      folder: 'junk',
      initialMessages: INBOUND_MESSAGES,
      initialNextCursor: null,
      folderLabel: 'Junk',
    });
    expect(screen.queryByTestId('bulk-junk-button')).not.toBeInTheDocument();
  });

  test('inbox shows junk button', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByTestId('bulk-junk-button')).toBeInTheDocument();
  });

  test('action buttons are disabled when nothing is selected', () => {
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByTestId('bulk-delete-button')).toBeDisabled();
    expect(screen.getByTestId('bulk-junk-button')).toBeDisabled();
  });

  test('clicking a message checkbox selects it and enables action buttons', async () => {
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    const checkboxes = screen.getAllByLabelText('Select email');
    await user.click(checkboxes[0]);
    expect(screen.getByTestId('bulk-delete-button')).not.toBeDisabled();
    expect(screen.getByTestId('selection-count')).toHaveTextContent('1 selected');
  });

  test('select all checkbox selects all displayed messages', async () => {
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    await user.click(screen.getByTestId('select-all-checkbox'));
    expect(screen.getByTestId('selection-count')).toHaveTextContent('2 selected');
  });

  test('clicking select all then unchecking deselects all', async () => {
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('select-all-checkbox'));
    expect(screen.queryByTestId('selection-count')).not.toBeInTheDocument();
  });

  test('bulk delete (non-trash) PATCHes messages with folder=trash and removes them from list', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('bulk-delete-button'));
    await waitFor(() => {
      expect(screen.queryByText('alice@test.com')).not.toBeInTheDocument();
      expect(screen.queryByText('bob@test.com')).not.toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/messages/'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'trash' }) }),
    );
  });

  test('bulk delete in trash folder calls DELETE endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    renderWithMessages({
      address: 'hello@example.com',
      direction: 'inbound',
      folder: 'trash',
      initialMessages: INBOUND_MESSAGES,
      initialNextCursor: null,
      folderLabel: 'Trash',
    });
    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('bulk-delete-button'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  test('bulk junk removes messages optimistically and PATCHes folder=junk', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('bulk-junk-button'));
    await waitFor(() => {
      expect(screen.queryByText('alice@test.com')).not.toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/messages/'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'junk' }) }),
    );
  });

  test('bulk mark read PATCHes messages and clears unread badges', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();
    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('bulk-mark-read-button'));
    await waitFor(() => {
      expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/messages/'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isRead: true }) }),
    );
  });

  test('bulk mark unread PATCHes messages and restores unread badges', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    const allRead = INBOUND_MESSAGES.map((m) => ({ ...m, isRead: true }));
    renderWithMessages(DEFAULT_INBOUND_PROPS, allRead as typeof INBOUND_MESSAGES);
    expect(screen.queryByLabelText('Unread')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('bulk-mark-unread-button'));
    await waitFor(() => {
      expect(screen.getAllByLabelText('Unread')).toHaveLength(2);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/messages/'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isRead: false }) }),
    );
  });

  test('bulk delete rolls back messages that fail', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    renderWithMessages(DEFAULT_INBOUND_PROPS);
    const checkboxes = screen.getAllByLabelText('Select email');
    await user.click(checkboxes[0]);
    await user.click(screen.getByTestId('bulk-delete-button'));
    await waitFor(() => {
      expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    });
  });
});
