import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposeSheet } from '@/components/messages/compose-sheet';
import { ComposeProvider } from '@/components/compose-context';
import { useCompose } from '@/components/compose-context';

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet-root">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetPortal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetOverlay: () => null,
  SheetFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ACTIVE_ADDRESSES = [
  { email: 'me@hermes.com', domain: 'hermes.com', status: 'active' },
  { email: 'work@hermes.com', domain: 'hermes.com', status: 'active' },
  { email: 'deleted@hermes.com', domain: 'hermes.com', status: 'deleted' },
];

function OpenComposeButton({ data }: { data?: Parameters<ReturnType<typeof useCompose>['openCompose']>[0] }) {
  const { openCompose } = useCompose();
  return <button onClick={() => openCompose(data)} data-testid="open-compose">Open</button>;
}

function TestWrapper({ initialData }: { initialData?: Parameters<ReturnType<typeof useCompose>['openCompose']>[0] }) {
  return (
    <ComposeProvider>
      <OpenComposeButton data={initialData} />
      <ComposeSheet addresses={ACTIVE_ADDRESSES} />
    </ComposeProvider>
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

async function advanceAutoSave() {
  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
}

describe('ComposeSheet', () => {
  describe('From dropdown', () => {
    test('shows only active (non-deleted) addresses in From dropdown', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));

      expect(screen.getByTestId('compose-from')).toBeInTheDocument();
      expect(screen.queryByText('deleted@hermes.com')).not.toBeInTheDocument();
    });

    test('defaults From to first active address', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));

      expect(screen.getByTestId('compose-from')).toHaveTextContent('me@hermes.com');
    });
  });

  describe('email validation', () => {
    test('shows validation error for invalid email in To field', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-to'), 'not-an-email');
      await user.type(screen.getByTestId('compose-subject'), 'Hello');
      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });
    });

    test('shows validation error for invalid email in Cc field', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-to'), 'valid@example.com');
      await user.type(screen.getByTestId('compose-cc'), 'bad-email');
      await user.type(screen.getByTestId('compose-subject'), 'Hello');
      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });
    });

    test('accepts comma-separated valid emails in To field', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: 'new-msg' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-to'), 'a@example.com, b@example.com');
      await user.type(screen.getByTestId('compose-subject'), 'Hello');
      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('auto-save', () => {
    test('shows Saving… indicator while save is in-flight', async () => {
      (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-body'), 'Hello');
      await advanceAutoSave();

      expect(screen.getByTestId('save-status-saving')).toBeInTheDocument();
    });

    test('calls POST /api/drafts on first auto-save', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ draftId: 'draft-new' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-body'), 'Hello');
      await advanceAutoSave();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/drafts',
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    test('shows Draft saved indicator after successful save', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ draftId: 'draft-new' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-body'), 'Hello');
      await advanceAutoSave();

      await waitFor(() => {
        expect(screen.getByTestId('save-status-saved')).toBeInTheDocument();
      });
    });

    test('calls PUT /api/drafts/:id on subsequent saves when initialDraftId is provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ draftId: 'draft-existing' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper initialData={{ draftId: 'draft-existing' }} />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-body'), 'Hello');
      await advanceAutoSave();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/drafts/draft-existing',
          expect.objectContaining({ method: 'PUT' }),
        );
      });
    });
  });

  describe('send', () => {
    test('calls POST /api/messages on send', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: 'new-msg' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-to'), 'recipient@example.com');
      await user.type(screen.getByTestId('compose-subject'), 'Hello');
      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/messages',
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    test('closes sheet after successful send', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: 'new-msg' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-to'), 'recipient@example.com');
      await user.type(screen.getByTestId('compose-subject'), 'Hello');
      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('compose-form')).not.toBeInTheDocument();
      });
    });

    test('shows error when send fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Send failed' }),
      });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      await user.type(screen.getByTestId('compose-to'), 'recipient@example.com');
      await user.type(screen.getByTestId('compose-subject'), 'Hello');
      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.getByTestId('compose-send-error')).toBeInTheDocument();
      });
    });
  });

  describe('discard', () => {
    test('calls DELETE /api/drafts/:id when draftId exists', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper initialData={{ draftId: 'draft-abc' }} />);

      await user.click(screen.getByTestId('open-compose'));
      await user.click(screen.getByTestId('compose-discard-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/drafts/draft-abc',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    test('closes sheet on discard without draft', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TestWrapper />);

      await user.click(screen.getByTestId('open-compose'));
      expect(screen.getByTestId('compose-form')).toBeInTheDocument();

      await user.click(screen.getByTestId('compose-discard-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('compose-form')).not.toBeInTheDocument();
      });
    });
  });

  describe('restoring draft fields', () => {
    test('restores all fields from initialData', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <TestWrapper
          initialData={{
            draftId: 'draft-1',
            from: 'me@hermes.com',
            to: 'them@example.com',
            subject: 'Draft subject',
            body: 'Draft body text',
          }}
        />,
      );

      await user.click(screen.getByTestId('open-compose'));

      expect(screen.getByTestId('compose-to')).toHaveValue('them@example.com');
      expect(screen.getByTestId('compose-subject')).toHaveValue('Draft subject');
      expect(screen.getByTestId('compose-body')).toHaveValue('Draft body text');
    });
  });
});
