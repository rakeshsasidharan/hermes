import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplyComposer } from '@/components/messages/reply-composer';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  usePathname: () => '/',
}));

const BASE_MESSAGE = {
  messageId: 'msg-1',
  subject: 'Hello there',
  from: 'sender@external.com',
  to: 'me@hermes.com',
  cc: 'other@example.com',
};

const DEFAULT_PROPS = {
  message: BASE_MESSAGE,
  mode: 'reply' as const,
  currentAddress: 'me@hermes.com',
  onClose: jest.fn(),
};

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('ReplyComposer', () => {
  describe('pre-filled fields', () => {
    test('pre-fills From with currentAddress as read-only', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      const fromInput = screen.getByTestId('reply-from');
      expect(fromInput).toHaveValue('me@hermes.com');
      expect(fromInput).toBeDisabled();
    });

    test('pre-fills To with original sender', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      expect(screen.getByTestId('reply-to')).toHaveValue('sender@external.com');
    });

    test('does not show Cc field for plain Reply', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      expect(screen.queryByTestId('reply-cc')).not.toBeInTheDocument();
    });

    test('shows Cc field for Reply All', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} mode="replyAll" />);

      expect(screen.getByTestId('reply-cc')).toBeInTheDocument();
    });

    test('pre-fills Cc for Reply All excluding currentAddress', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} mode="replyAll" />);

      const ccInput = screen.getByTestId('reply-cc');
      expect(ccInput).toHaveValue('other@example.com');
      expect((ccInput as HTMLInputElement).value).not.toContain('me@hermes.com');
    });

    test('includes quoted body in textarea when quotedBody is provided', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} quotedBody="Original message text" />);

      const textarea = screen.getByTestId('reply-body');
      expect((textarea as HTMLTextAreaElement).value).toContain('Original message text');
    });
  });

  describe('save draft button', () => {
    test('shows Save Draft button', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} />);
      expect(screen.getByTestId('save-draft-button')).toBeInTheDocument();
    });

    test('calls POST /api/drafts when Save Draft is clicked for a new draft', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ draftId: 'draft-abc' }),
      });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      await user.type(screen.getByTestId('reply-body'), 'Hello');
      await user.click(screen.getByTestId('save-draft-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/drafts',
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    test('shows Draft saved indicator after Save Draft is clicked', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ draftId: 'draft-abc' }),
      });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      await user.type(screen.getByTestId('reply-body'), 'Hello');
      await user.click(screen.getByTestId('save-draft-button'));

      await waitFor(() => {
        expect(screen.getByTestId('save-status-saved')).toBeInTheDocument();
      });
    });

    test('calls PUT /api/drafts/:id when Save Draft is clicked with an existing draft', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ draftId: 'draft-existing' }),
      });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} initialDraftId="draft-existing" />);

      await user.type(screen.getByTestId('reply-body'), 'Hello');
      await user.click(screen.getByTestId('save-draft-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/drafts/draft-existing',
          expect.objectContaining({ method: 'PUT' }),
        );
      });
    });

    test('does not auto-save when fields change', async () => {
      jest.useFakeTimers();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ draftId: 'draft-abc' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      await user.type(screen.getByTestId('reply-body'), 'Hello');
      await act(async () => { jest.advanceTimersByTime(30_000); });

      expect(global.fetch).not.toHaveBeenCalledWith(
        '/api/drafts',
        expect.objectContaining({ method: 'POST' }),
      );
      jest.useRealTimers();
    });
  });

  describe('send', () => {
    test('calls POST /api/messages/:id/reply on Send click', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ messageId: 'new-msg' }) });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      await user.click(screen.getByTestId('send-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/messages/msg-1/reply',
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    test('calls onClose after successful send', async () => {
      const onClose = jest.fn();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ messageId: 'new-msg' }) });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} onClose={onClose} />);

      await user.click(screen.getByTestId('send-button'));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    test('shows error message when send fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Failed to send' }),
      });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      await user.click(screen.getByTestId('send-button'));

      await waitFor(() => {
        expect(screen.getByTestId('send-error')).toBeInTheDocument();
      });
    });

    test('Send button is disabled when To field is empty', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} message={{ ...BASE_MESSAGE, from: undefined }} />);

      expect(screen.getByTestId('send-button')).toBeDisabled();
    });
  });

  describe('discard', () => {
    test('calls DELETE /api/drafts/:id on discard when draftId exists', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} initialDraftId="draft-xyz" />);

      await user.click(screen.getByTestId('discard-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/drafts/draft-xyz',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    test('calls onClose on discard without draft', async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} onClose={onClose} />);

      await user.click(screen.getByTestId('discard-button'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('attachments', () => {
    test('shows attach button', () => {
      render(<ReplyComposer {...DEFAULT_PROPS} />);
      expect(screen.getByTestId('attach-button')).toBeInTheDocument();
    });

    test('uploads file and shows it in attachment list', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          s3Key: 'uploads/uuid/report.pdf',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          size: 1024,
        }),
      });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      const file = new File(['content'], 'report.pdf', { type: 'application/pdf' });
      await user.upload(screen.getByTestId('file-input'), file);

      await waitFor(() => {
        expect(screen.getByTestId('attachment-list')).toBeInTheDocument();
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });
    });

    test('removes attachment from list on remove click', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          s3Key: 'uploads/uuid/doc.pdf',
          filename: 'doc.pdf',
          contentType: 'application/pdf',
          size: 512,
        }),
      });
      const user = userEvent.setup();
      render(<ReplyComposer {...DEFAULT_PROPS} />);

      await user.upload(screen.getByTestId('file-input'), new File(['content'], 'doc.pdf', { type: 'application/pdf' }));
      await waitFor(() => expect(screen.getByText('doc.pdf')).toBeInTheDocument());

      await user.click(screen.getByTestId('remove-attachment-doc.pdf'));
      expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
    });
  });
});
