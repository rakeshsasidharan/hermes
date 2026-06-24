import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposeEditor } from '@/components/drafts/compose-editor';
import { setNavigationGuard } from '@/lib/navigation-guard';

jest.mock('@/lib/navigation-guard', () => ({
  setNavigationGuard: jest.fn(),
}));

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSendEmailUnwrap = jest.fn().mockResolvedValue({ messageId: 'new-msg' });
const mockSendEmail = jest.fn(() => ({ unwrap: mockSendEmailUnwrap }));
const mockInvalidateTags = jest.fn(() => ({ type: 'test/invalidate' }));
const mockUpdateQueryData = jest.fn(() => ({ type: 'test/update' }));
jest.mock('@/store/api', () => ({
  useSendEmailMutation: () => [mockSendEmail],
  apiSlice: {
    util: {
      invalidateTags: (...args: unknown[]) => mockInvalidateTags(...args),
      updateQueryData: (...args: unknown[]) => mockUpdateQueryData(...args),
    },
  },
}));

const mockDispatch = jest.fn((action) => action);
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

const DRAFT = {
  draftId: 'draft-abc',
  from: 'me@hermes.com',
  to: 'them@example.com',
  subject: 'Hello',
  body: 'Draft body',
};

const EMPTY_DRAFT = {
  draftId: 'draft-empty',
  from: 'me@hermes.com',
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  mockSendEmailUnwrap.mockResolvedValue({ messageId: 'new-msg' });
  mockPush.mockReset();
  mockDispatch.mockClear();
  mockSendEmail.mockClear();
  mockSendEmailUnwrap.mockClear();
  mockInvalidateTags.mockClear();
  mockUpdateQueryData.mockClear();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('ComposeEditor', () => {
  describe('initial render', () => {
    test('renders compose form', () => {
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);
      expect(screen.getByTestId('compose-form')).toBeInTheDocument();
    });

    test('restores To, Subject, and Body from draft', () => {
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);
      expect(screen.getByTestId('compose-to')).toHaveValue('them@example.com');
      expect(screen.getByTestId('compose-subject')).toHaveValue('Hello');
      expect(screen.getByTestId('compose-body')).toHaveValue('Draft body');
    });

    test('shows From address as read-only text', () => {
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);
      expect(screen.getByText('me@hermes.com')).toBeInTheDocument();
    });

    test('shows subject in header when set', () => {
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    test('shows "New Message" in header when subject is empty', () => {
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  describe('Save Draft', () => {
    test('calls PUT /api/drafts/:id on save', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-save-draft-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/drafts/${DRAFT.draftId}`,
          expect.objectContaining({ method: 'PUT' }),
        );
      });
    });

    test('shows saved indicator after successful save', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-save-draft-button'));

      await waitFor(() => {
        expect(screen.getByTestId('save-status-saved')).toBeInTheDocument();
      });
    });

    test('invalidates Draft cache after successful save', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-save-draft-button'));

      await waitFor(() => {
        expect(mockInvalidateTags).toHaveBeenCalledWith(['Draft']);
        expect(mockDispatch).toHaveBeenCalledWith({ type: 'test/invalidate' });
      });
    });
  });

  describe('Send', () => {
    test('shows error when To is empty on send', async () => {
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.getByTestId('compose-to-error')).toBeInTheDocument();
      });
    });

    test('shows error for invalid email in To field', async () => {
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'not-an-email');
      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.getByTestId('compose-to-error')).toBeInTheDocument();
      });
    });

    test('calls sendEmail mutation on send with valid To', async () => {
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(mockSendEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            from: DRAFT.from,
            to: DRAFT.to,
            draftId: DRAFT.draftId,
          }),
        );
      });
    });

    test('navigates to drafts list after successful send', async () => {
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/drafts/${encodeURIComponent('me@hermes.com')}`,
        );
      });
    });

    test('does not synchronously update cache on send — relies on invalidatesTags refetch', async () => {
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/drafts/${encodeURIComponent('me@hermes.com')}`);
      });
      // updateQueryData must NOT be called — that would update the list synchronously
      // before navigation completes, making the draft disappear before the editor closes.
      expect(mockUpdateQueryData).not.toHaveBeenCalled();
    });

    test('shows error when send fails', async () => {
      mockSendEmailUnwrap.mockRejectedValueOnce({ data: { error: 'Send failed' } });
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-send-button'));

      await waitFor(() => {
        expect(screen.getByTestId('compose-send-error')).toBeInTheDocument();
      });
    });
  });

  describe('Discard', () => {
    test('deletes draft and navigates away when no content entered', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-discard-button'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/drafts/${EMPTY_DRAFT.draftId}`,
          expect.objectContaining({ method: 'DELETE' }),
        );
        expect(mockPush).toHaveBeenCalledWith(
          `/drafts/${encodeURIComponent('me@hermes.com')}`,
        );
      });
    });

    test('shows confirmation dialog when discarding with unsaved content', async () => {
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'someone@example.com');
      await user.click(screen.getByTestId('compose-discard-button'));

      expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    });

    test('discards from confirmation dialog', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'someone@example.com');
      await user.click(screen.getByTestId('compose-discard-button'));
      await user.click(screen.getByTestId('discard-dialog-confirm'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/drafts/${EMPTY_DRAFT.draftId}`,
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    test('saves draft from confirmation dialog', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-body'), 'some content');
      await user.click(screen.getByTestId('compose-discard-button'));
      await user.click(screen.getByTestId('discard-dialog-save'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/drafts/${EMPTY_DRAFT.draftId}`,
          expect.objectContaining({ method: 'PUT' }),
        );
      });
    });

    test('no confirmation dialog when content matches saved state', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-save-draft-button'));
      await waitFor(() => expect(screen.getByTestId('save-status-saved')).toBeInTheDocument());

      await user.click(screen.getByTestId('compose-discard-button'));

      expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
    });
  });

  describe('navigation guard', () => {
    function captureGuard(): { invoke: (proceed?: () => void) => void } {
      let captured: ((proceed: () => void) => void) | null = null;
      (setNavigationGuard as jest.Mock).mockImplementation((fn) => { captured = fn; });
      return {
        invoke(proceed = jest.fn()) {
          act(() => { captured?.(proceed); });
        },
      };
    }

    test('registers guard when draft becomes dirty with content', async () => {
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'someone@example.com');

      expect(setNavigationGuard).toHaveBeenCalledWith(expect.any(Function));
    });

    test('clears guard when draft is saved (no longer dirty)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'someone@example.com');
      await user.click(screen.getByTestId('compose-save-draft-button'));
      await waitFor(() => expect(screen.getByTestId('save-status-saved')).toBeInTheDocument());

      expect(setNavigationGuard).toHaveBeenLastCalledWith(null);
    });

    test('shows dialog when guard fires with unsaved dirty content', async () => {
      const user = userEvent.setup();
      const guard = captureGuard();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'someone@example.com');
      guard.invoke();

      expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
    });

    test('cancel closes dialog and does not call proceed', async () => {
      const user = userEvent.setup();
      const guard = captureGuard();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'someone@example.com');
      const proceed = jest.fn();
      guard.invoke(proceed);

      await user.click(screen.getByTestId('discard-dialog-cancel'));

      expect(screen.queryByTestId('alert-dialog')).not.toBeInTheDocument();
      expect(proceed).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    test('discarding from guard dialog deletes draft and calls proceed', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      const guard = captureGuard();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-to'), 'someone@example.com');
      const proceed = jest.fn();
      guard.invoke(proceed);

      await user.click(screen.getByTestId('discard-dialog-confirm'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/drafts/${EMPTY_DRAFT.draftId}`,
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
      expect(proceed).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    test('saving from guard dialog saves draft and calls proceed', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      const guard = captureGuard();
      render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.type(screen.getByTestId('compose-body'), 'some content');
      const proceed = jest.fn();
      guard.invoke(proceed);

      await user.click(screen.getByTestId('discard-dialog-save'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/drafts/${EMPTY_DRAFT.draftId}`,
          expect.objectContaining({ method: 'PUT' }),
        );
      });
      expect(proceed).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    test('does not register guard when draft is clean (not dirty)', () => {
      render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);
      // DRAFT fields match initial saved state — isDirty is false
      const guardCalls = (setNavigationGuard as jest.Mock).mock.calls.filter(
        ([fn]) => fn !== null,
      );
      expect(guardCalls).toHaveLength(0);
    });
  });

  describe('auto-cleanup on navigate away', () => {
    test('deletes empty draft on unmount when user never saved', () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const { unmount } = render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      unmount();

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/drafts/${EMPTY_DRAFT.draftId}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    test('does not delete on unmount after user saved', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      const { unmount } = render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-save-draft-button'));
      await waitFor(() => expect(screen.getByTestId('save-status-saved')).toBeInTheDocument());

      unmount();

      const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url, opts]: [string, RequestInit]) => url.includes(EMPTY_DRAFT.draftId) && opts?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(0);
    });

    test('does not auto-delete drafts that already had content when opened', () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const { unmount } = render(<ComposeEditor draft={DRAFT} address="me@hermes.com" />);

      unmount();

      const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url, opts]: [string, RequestInit]) => url.includes(DRAFT.draftId) && opts?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(0);
    });

    test('does not double-delete when user explicitly discards', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      const { unmount } = render(<ComposeEditor draft={EMPTY_DRAFT} address="me@hermes.com" />);

      await user.click(screen.getByTestId('compose-discard-button'));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
        `/api/drafts/${EMPTY_DRAFT.draftId}`, expect.objectContaining({ method: 'DELETE' }),
      ));

      unmount();

      const deleteCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([url, opts]: [string, RequestInit]) => url.includes(EMPTY_DRAFT.draftId) && opts?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(1);
    });
  });
});
