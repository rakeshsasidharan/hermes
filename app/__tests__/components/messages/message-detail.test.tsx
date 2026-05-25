import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageDetail } from '@/components/messages/message-detail';

const mockPathname = jest.fn().mockReturnValue('/inbox/test%40example.com/msg-1');
const mockRouterRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: jest.fn(), refresh: mockRouterRefresh }),
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


beforeEach(() => {
  global.fetch = jest.fn();
  mockPathname.mockReturnValue('/inbox/test%40example.com/msg-1');
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
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<MessageDetail message={{ ...BASE_MSG, isRead: false }} />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isRead: true }) }),
      );
    });
  });

  test('does not call PATCH when message is already read', () => {
    render(<MessageDetail message={{ ...BASE_MSG, isRead: true }} />);
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/messages/msg-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  test('dispatches hermes:readstatus event after auto-marking as read', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const events: CustomEvent[] = [];
    window.addEventListener('hermes:readstatus', (e) => events.push(e as CustomEvent));
    render(<MessageDetail message={{ ...BASE_MSG, isRead: false }} />);
    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].detail).toEqual({ messageId: 'msg-1', isRead: true });
    });
    window.removeEventListener('hermes:readstatus', (e) => events.push(e as CustomEvent));
  });

  test('calls router.refresh after auto-marking as read to bust Router Cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<MessageDetail message={{ ...BASE_MSG, isRead: false }} />);
    await waitFor(() => {
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });
  });

  test('does not call router.refresh when message is already read', () => {
    render(<MessageDetail message={{ ...BASE_MSG, isRead: true }} />);
    expect(mockRouterRefresh).not.toHaveBeenCalled();
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
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={{ ...BASE_MSG, isRead: true }} />);
    await user.click(screen.getByRole('button', { name: /mark as unread/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
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
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /^reply$/i }));
    expect(screen.getByTestId('reply-composer')).toBeInTheDocument();
  });

  test('opens ReplyComposer in replyAll mode on Reply All click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /reply all/i }));
    expect(screen.getByTestId('reply-composer')).toBeInTheDocument();
    expect(screen.getByTestId('reply-cc')).toBeInTheDocument();
  });

  test('dispatches hermes:messageremoved after permanent delete from junk', async () => {
    mockPathname.mockReturnValue('/junk/test%40example.com/msg-1');
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const events: CustomEvent[] = [];
    window.addEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].detail).toEqual({ messageId: 'msg-1' });
    });
    window.removeEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
  });
});

describe('MessageDetail — Move to Trash', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockPathname.mockReturnValue('/inbox/test%40example.com/msg-1');
  });

  test('inbox Delete button has aria-label Move to Trash', () => {
    render(<MessageDetail message={BASE_MSG} />);
    expect(screen.getByRole('button', { name: /move to trash/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  test('calls PATCH with folder=trash when Move to Trash clicked from inbox', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to trash/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'trash' }) }),
      );
    });
  });

  test('dispatches hermes:messageremoved after Move to Trash', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const events: CustomEvent[] = [];
    window.addEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to trash/i }));
    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].detail).toEqual({ messageId: 'msg-1' });
    });
    window.removeEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
  });

  test('calls toast.error when Move to Trash fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
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
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});

describe('MessageDetail — Move to Junk', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockPathname.mockReturnValue('/inbox/test%40example.com/msg-1');
  });

  test('calls PATCH with folder=junk on Move to Junk click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to junk/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'junk' }) }),
      );
    });
  });

  test('dispatches hermes:messageremoved after Move to Junk', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const events: CustomEvent[] = [];
    window.addEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /move to junk/i }));
    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].detail).toEqual({ messageId: 'msg-1' });
    });
    window.removeEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
  });

  test('calls toast.error when Move to Junk fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
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
    global.fetch = jest.fn();
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
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'inbox' }) }),
      );
    });
  });

  test('dispatches hermes:messageremoved after Restore to Inbox from trash', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const events: CustomEvent[] = [];
    window.addEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].detail).toEqual({ messageId: 'msg-1' });
    });
    window.removeEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
  });
});

describe('MessageDetail — junk folder', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
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
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ folder: 'inbox' }) }),
      );
    });
  });

  test('dispatches hermes:messageremoved after Restore to Inbox', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const events: CustomEvent[] = [];
    window.addEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].detail).toEqual({ messageId: 'msg-1' });
    });
    window.removeEventListener('hermes:messageremoved', (e) => events.push(e as CustomEvent));
  });

  test('calls toast.error when Restore to Inbox fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<MessageDetail message={BASE_MSG} />);
    await user.click(screen.getByRole('button', { name: /restore to inbox/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/failed to restore/i));
    });
  });
});
