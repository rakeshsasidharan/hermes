import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageDetail } from '@/components/messages/message-detail';

jest.mock('next/navigation', () => ({
  usePathname: () => '/inbox/test%40example.com/msg-1',
  useRouter: () => ({ push: jest.fn() }),
}));

beforeEach(() => {
  global.fetch = jest.fn();
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
    expect(screen.getByText(/Alice <alice@test.com>/)).toBeInTheDocument();
    expect(screen.getByText(/hello@example.com/)).toBeInTheDocument();
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

  test('marks message as read on mount when unread', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<MessageDetail message={{ ...BASE_MSG, isRead: false }} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isRead: true }),
        }),
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

  test('toggles read status on Mark as Unread click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<MessageDetail message={{ ...BASE_MSG, isRead: true }} />);

    await user.click(screen.getByRole('button', { name: /mark as unread/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/messages/msg-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isRead: false }),
        }),
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
    const downloadLinks = screen.getAllByRole('link', { name: /download/i });
    expect(downloadLinks).toHaveLength(2);
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
});
