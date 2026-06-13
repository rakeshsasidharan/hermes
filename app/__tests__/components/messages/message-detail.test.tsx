import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageDetail } from '@/components/messages/message-detail';

const mockPathname = jest.fn().mockReturnValue('/inbox/test%40example.com/msg-1');
const mockRouterPush = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockRouterPush, refresh: jest.fn() }),
}));

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastInfo = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

const mockMarkReadStatusFn = jest.fn();
const mockMoveMessageFn = jest.fn();
const mockDeleteMessageFn = jest.fn();
const mockReplyToMessageFn = jest.fn();
const mockSendEmailFn = jest.fn();

jest.mock('@/store/api', () => ({
  useMarkReadStatusMutation: jest.fn(() => [mockMarkReadStatusFn]),
  useMoveMessageMutation: jest.fn(() => [mockMoveMessageFn]),
  useDeleteMessageMutation: jest.fn(() => [mockDeleteMessageFn]),
  useReplyToMessageMutation: jest.fn(() => [mockReplyToMessageFn]),
  useSendEmailMutation: jest.fn(() => [mockSendEmailFn]),
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  mockPathname.mockReturnValue('/inbox/test%40example.com/msg-1');

  mockMarkReadStatusFn.mockImplementation(async ({ messageId, isRead }: { messageId: string; isRead: boolean }) => {
    const res = await (global.fetch as jest.Mock)(
      `/api/messages/${encodeURIComponent(messageId)}`,
      { method: 'PATCH', body: JSON.stringify({ isRead }) },
    );
    return (res as { ok: boolean }).ok ? { data: {} } : { error: { data: {} } };
  });

  mockMoveMessageFn.mockImplementation(async ({ messageId, targetFolder }: { messageId: string; targetFolder: string }) => {
    const res = await (global.fetch as jest.Mock)(
      `/api/messages/${encodeURIComponent(messageId)}`,
      { method: 'PATCH', body: JSON.stringify({ folder: targetFolder }) },
    );
    return (res as { ok: boolean }).ok ? { data: {} } : { error: { data: {} } };
  });

  mockDeleteMessageFn.mockImplementation(async ({ messageId }: { messageId: string }) => {
    const res = await (global.fetch as jest.Mock)(
      `/api/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE' },
    );
    return (res as { ok: boolean }).ok ? { data: {} } : { error: { data: {} } };
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

const BASE_MSG = {
  messageId: 'msg-1',
  sender: 'alice@test.com',
  subject: 'Hello World',
  receivedAt: '2026-01-01T10:00:00Z',
  isRead: true,
  from: 'Alice <alice@test.com>',
  to: 'hello@example.com',
  cc: undefined,
  bodyHtmlUrl: undefined,
  bodyTextUrl: undefined,
  attachments: [],
};

describe('MessageDetail', () => {
  test('renders subject, from, to, and date', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getAllByText(/Alice <alice@test.com>/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/hello@example.com/).length).toBeGreaterThanOrEqual(1);
  });

  test('shows no body fallback when no URL provided', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByText(/no message body/i)).toBeInTheDocument();
  });

  test('renders sandboxed iframe when initialHtmlBody is provided', async () => {
    render(<MessageDetail message={BASE_MSG} initialHtmlBody="<p>HTML body</p>" />);
    await waitFor(() => {
      const iframe = screen.getByTestId('html-body-frame');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
    });
  });

  test('renders plain text body when initialTextBody is provided', () => {
    render(<MessageDetail message={BASE_MSG} initialTextBody="Plain text body content" />);
    expect(screen.getByTestId('text-body')).toHaveTextContent('Plain text body content');
  });

  test('marks message as read on mount when unread (inbox)', async () => {
    render(<MessageDetail message={{ ...BASE_MSG, isRead: false }} />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isRead: true }) }),
      );
    });
  });

  test('does not call PATCH when message is already read', async () => {
    render(<MessageDetail message={{ ...BASE_MSG, isRead: true }} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const patchCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([, opts]) => opts?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });

  test('shows Mark as Unread button on inbox route', () => {
    mockPathname.mockReturnValue('/inbox/test%40example.com/msg-1');
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByRole('button', { name: /mark as unread/i })).toBeInTheDocument();
  });

  test('hides Mark as Unread button on sent route', () => {
    mockPathname.mockReturnValue('/sent/test%40example.com/msg-1');
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.queryByRole('button', { name: /mark as (un)?read/i })).not.toBeInTheDocument();
  });

  test('hides Mark as Unread button on drafts route', () => {
    mockPathname.mockReturnValue('/drafts/test%40example.com/msg-1');
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.queryByRole('button', { name: /mark as (un)?read/i })).not.toBeInTheDocument();
  });

  test('toggles read status on Mark as Unread click', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={{ ...BASE_MSG, isRead: true }} />);
    await user.click(screen.getByRole('button', { name: /mark as unread/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isRead: false }) }),
      );
    });
  });

  test('shows attachments with download links', () => {
    const msg = {
      ...BASE_MSG,
      attachments: [
        { filename: 'report.pdf', url: 'https://s3.example.com/report.pdf' },
        { filename: 'image.png', url: 'https://s3.example.com/image.png' },
      ],
    };
    render(<MessageDetail message={msg} />);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('image.png')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /download/i })).toHaveLength(2);
  });

  test('opens ReplyComposer on Reply click', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /^reply$/i }));
    expect(screen.getByTestId('reply-composer')).toBeInTheDocument();
  });

  test('opens ReplyComposer in replyAll mode on Reply All click', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /reply all/i }));
    expect(screen.getByTestId('reply-composer')).toBeInTheDocument();
    expect(screen.getByTestId('reply-cc')).toBeInTheDocument();
  });

  test('permanent delete from junk calls DELETE and navigates away', async () => {
    mockPathname.mockReturnValue('/junk/test%40example.com/msg-1');
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});

describe('MessageDetail — Move to Trash', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    mockPathname.mockReturnValue('/inbox/test%40example.com/msg-1');
  });

  test('inbox Delete button has aria-label Move to Trash', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByRole('button', { name: /move to trash/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  test('calls PATCH with folder=trash when Move to Trash clicked from inbox', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to trash/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'trash' }) }),
      );
    });
  });

  test('navigates to list after Move to Trash succeeds', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to trash/i }));
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/inbox/test%40example.com');
    });
  });

  test('calls toast.error when Move to Trash fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to trash/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/failed to move/i));
    });
  });
});

describe('MessageDetail — Delete (permanent) from junk and trash', () => {
  test('junk Delete button has aria-label Delete (not Move to Trash)', () => {
    mockPathname.mockReturnValue('/junk/test%40example.com/msg-1');
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move to trash/i })).not.toBeInTheDocument();
  });

  test('trash Delete button uses permanent DELETE', async () => {
    mockPathname.mockReturnValue('/trash/test%40example.com/msg-1');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});

describe('MessageDetail — Move to Junk', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    mockPathname.mockReturnValue('/inbox/test%40example.com/msg-1');
  });

  test('calls PATCH with folder=junk on Move to Junk click', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to junk/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'junk' }) }),
      );
    });
  });

  test('calls toast.error when Move to Junk fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to junk/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/failed to move/i));
    });
  });
});

describe('MessageDetail — trash folder', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    mockPathname.mockReturnValue('/trash/test%40example.com/msg-1');
  });

  test('shows Restore to Inbox button when in trash folder', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByRole('button', { name: /restore to inbox/i })).toBeInTheDocument();
  });

  test('does not show Move to Junk button when in trash folder', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.queryByRole('button', { name: /move to junk/i })).not.toBeInTheDocument();
  });

  test('does not show read toggle when in trash folder', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.queryByRole('button', { name: /mark as (un)?read/i })).not.toBeInTheDocument();
  });

  test('calls PATCH with folder=inbox on Restore to Inbox click', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'inbox' }) }),
      );
    });
  });

  test('navigates to list after Restore to Inbox', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/trash/test%40example.com');
    });
  });

  test('shows success toast after Restore to Inbox', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Moved to Inbox');
    });
  });
});

describe('MessageDetail — junk folder', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    mockPathname.mockReturnValue('/junk/test%40example.com/msg-1');
  });

  test('shows Restore to Inbox button when in junk folder', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByRole('button', { name: /restore to inbox/i })).toBeInTheDocument();
  });

  test('does not show Move to Junk button when in junk folder', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.queryByRole('button', { name: /move to junk/i })).not.toBeInTheDocument();
  });

  test('shows read toggle when in junk folder', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByRole('button', { name: /mark as (un)?read/i })).toBeInTheDocument();
  });

  test('calls PATCH with folder=inbox on Restore to Inbox click', async () => {
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages/msg-1'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'inbox' }) }),
      );
    });
  });

  test('calls toast.error when Restore to Inbox fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/failed to restore/i));
    });
  });
});
