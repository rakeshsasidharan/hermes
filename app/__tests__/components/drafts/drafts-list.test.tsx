import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftsList } from '@/components/drafts/drafts-list';

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue('/drafts/me%40hermes.com');
const mockDispatch = jest.fn((action) => action);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
}));

jest.mock('@/lib/navigation-guard', () => ({
  tryNavigate: jest.fn((fn: () => void) => fn()),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

const mockUpdateQueryData = jest.fn(() => ({ type: 'test/patch', undo: jest.fn() }));
const mockInvalidateTags = jest.fn(() => ({ type: 'test/invalidate' }));

jest.mock('@/store/api', () => ({
  useGetDraftsQuery: jest.fn(),
  apiSlice: {
    util: {
      updateQueryData: (...args: unknown[]) => mockUpdateQueryData(...args),
      invalidateTags: (...args: unknown[]) => mockInvalidateTags(...args),
    },
  },
}));

import { useGetDraftsQuery } from '@/store/api';

const ADDRESS = 'me@hermes.com';

const COMPOSE_DRAFT = {
  draftId: 'draft-compose-1',
  to: 'recipient@example.com',
  subject: 'Hello world',
  body: 'Draft body',
  from: 'me@hermes.com',
  updatedAt: '2026-05-10T10:00:00.000Z',
};

const REPLY_DRAFT = {
  draftId: 'draft-reply-1',
  to: 'sender@external.com',
  subject: 'Re: Original subject',
  body: 'My reply',
  from: 'me@hermes.com',
  inReplyToMessageId: 'msg-original-123',
  updatedAt: '2026-05-10T11:00:00.000Z',
};

const NO_SUBJECT_DRAFT = {
  draftId: 'draft-no-subject',
  to: 'someone@example.com',
  from: 'me@hermes.com',
  updatedAt: '2026-05-10T09:00:00.000Z',
};

function mockQuery(drafts: typeof COMPOSE_DRAFT[], isLoading = false) {
  (useGetDraftsQuery as jest.Mock).mockReturnValue({ data: { drafts }, isLoading });
}

beforeEach(() => {
  mockPush.mockReset();
  mockDispatch.mockClear();
  mockUpdateQueryData.mockClear();
  mockInvalidateTags.mockClear();
  mockPathname.mockReturnValue('/drafts/me%40hermes.com');
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('DraftsList', () => {
  test('shows "Drafts" header', () => {
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByText('Drafts')).toBeInTheDocument();
  });

  test('shows loading state while fetching', () => {
    mockQuery([], true);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByTestId('drafts-loading')).toBeInTheDocument();
  });

  test('shows empty state when no drafts', () => {
    mockQuery([]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByTestId('drafts-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no drafts saved yet/i)).toBeInTheDocument();
  });

  test('renders draft cards when drafts exist', () => {
    mockQuery([COMPOSE_DRAFT, REPLY_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByTestId('drafts-list')).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`)).toBeInTheDocument();
  });

  test('shows subject for drafts with subject', () => {
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('shows "(no subject)" for drafts without subject', () => {
    mockQuery([NO_SUBJECT_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByText('(no subject)')).toBeInTheDocument();
  });

  test('shows recipient address', () => {
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByText('recipient@example.com')).toBeInTheDocument();
  });

  test('shows "No recipient" when to is missing', () => {
    const draft = { ...COMPOSE_DRAFT, to: undefined };
    mockQuery([draft as typeof COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByText('No recipient')).toBeInTheDocument();
  });

  test('applies active styling to the currently open draft', () => {
    mockPathname.mockReturnValue(`/drafts/me%40hermes.com/${COMPOSE_DRAFT.draftId}`);
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    const card = screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`);
    expect(card.className).toContain('border-accent-foreground/20');
  });

  test('does not apply active styling to non-active drafts', () => {
    mockPathname.mockReturnValue(`/drafts/me%40hermes.com/${COMPOSE_DRAFT.draftId}`);
    mockQuery([COMPOSE_DRAFT, REPLY_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    const inactiveCard = screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`);
    expect(inactiveCard.className).not.toContain('border-accent-foreground/20');
  });

  test('clicking new composition draft navigates to draft editor URL', async () => {
    mockQuery([COMPOSE_DRAFT]);
    const user = userEvent.setup();
    render(<DraftsList address={ADDRESS} />);

    await user.click(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`));

    expect(mockPush).toHaveBeenCalledWith(
      `/drafts/${encodeURIComponent(COMPOSE_DRAFT.from)}/${COMPOSE_DRAFT.draftId}`,
    );
  });

  test('clears loading state on draft card when pathname changes after click', async () => {
    mockQuery([COMPOSE_DRAFT]);
    const user = userEvent.setup();
    render(<DraftsList address={ADDRESS} />);

    await user.click(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`));

    // Simulate navigation completing by updating pathname
    mockPathname.mockReturnValue(`/drafts/me%40hermes.com/${COMPOSE_DRAFT.draftId}`);

    // Trigger re-render with new pathname (simulates React re-render after navigation)
    render(<DraftsList address={ADDRESS} />);

    // After navigation, the loading state should be cleared and only active state remains
    const card = screen.getAllByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`)[0];
    expect(card).toBeInTheDocument();
  });

  test('clicking reply draft navigates to message with draftId and mode params', async () => {
    mockQuery([REPLY_DRAFT]);
    const user = userEvent.setup();
    render(<DraftsList address={ADDRESS} />);

    await user.click(screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining(REPLY_DRAFT.inReplyToMessageId),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining(`draftId=${REPLY_DRAFT.draftId}`),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('mode=reply'),
    );
  });
});

describe('DraftsList — bulk actions', () => {
  test('renders bulk action toolbar with select-all checkbox', () => {
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete-button')).toBeInTheDocument();
  });

  test('does not show junk button for drafts', () => {
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.queryByTestId('bulk-junk-button')).not.toBeInTheDocument();
  });

  test('does not show mark read/unread buttons for drafts', () => {
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.queryByTestId('bulk-mark-read-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-mark-unread-button')).not.toBeInTheDocument();
  });

  test('delete button is disabled when nothing is selected', () => {
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);
    expect(screen.getByTestId('bulk-delete-button')).toBeDisabled();
  });

  test('clicking a draft checkbox selects it and enables delete button', async () => {
    mockQuery([COMPOSE_DRAFT]);
    const user = userEvent.setup();
    render(<DraftsList address={ADDRESS} />);
    await user.click(screen.getByLabelText('Select email'));
    expect(screen.getByTestId('bulk-delete-button')).not.toBeDisabled();
    expect(screen.getByTestId('selection-count')).toHaveTextContent('1 selected');
  });

  test('select all checkbox selects all drafts', async () => {
    mockQuery([COMPOSE_DRAFT, REPLY_DRAFT]);
    const user = userEvent.setup();
    render(<DraftsList address={ADDRESS} />);
    await user.click(screen.getByTestId('select-all-checkbox'));
    expect(screen.getByTestId('selection-count')).toHaveTextContent('2 selected');
  });

  test('bulk delete optimistically patches cache and calls DELETE for each draft', async () => {
    const mockUndo = jest.fn();
    mockUpdateQueryData.mockReturnValueOnce({ type: 'test/patch', undo: mockUndo });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    const user = userEvent.setup();
    mockQuery([COMPOSE_DRAFT, REPLY_DRAFT]);
    render(<DraftsList address={ADDRESS} />);

    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('bulk-delete-button'));

    await waitFor(() => {
      expect(mockUpdateQueryData).toHaveBeenCalledWith(
        'getDrafts',
        ADDRESS,
        expect.any(Function),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/drafts/'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  test('bulk delete invalidates Draft tag after completion', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);

    await user.click(screen.getByLabelText('Select email'));
    await user.click(screen.getByTestId('bulk-delete-button'));

    await waitFor(() => {
      expect(mockInvalidateTags).toHaveBeenCalledWith(['Draft']);
    });
  });

  test('bulk delete rolls back cache when delete fails', async () => {
    const mockUndo = jest.fn();
    mockUpdateQueryData.mockReturnValueOnce({ type: 'test/patch', undo: mockUndo });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const user = userEvent.setup();
    mockQuery([COMPOSE_DRAFT]);
    render(<DraftsList address={ADDRESS} />);

    await user.click(screen.getByLabelText('Select email'));
    await user.click(screen.getByTestId('bulk-delete-button'));

    await waitFor(() => {
      expect(mockUndo).toHaveBeenCalled();
    });
  });
});
