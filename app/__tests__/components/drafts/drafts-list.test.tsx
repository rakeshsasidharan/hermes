import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftsList } from '@/components/drafts/drafts-list';

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue('/drafts/me%40hermes.com');

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => mockPathname(),
}));

jest.mock('@/lib/navigation-guard', () => ({
  tryNavigate: jest.fn((fn: () => void) => fn()),
}));

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

beforeEach(() => {
  mockPush.mockReset();
  mockPathname.mockReturnValue('/drafts/me%40hermes.com');
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('DraftsList', () => {
  test('shows "Drafts" header', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    expect(screen.getByText('Drafts')).toBeInTheDocument();
  });

  test('shows empty state when no drafts', () => {
    render(<DraftsList drafts={[]} address={ADDRESS} />);
    expect(screen.getByTestId('drafts-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no drafts saved yet/i)).toBeInTheDocument();
  });

  test('renders draft cards when drafts exist', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT, REPLY_DRAFT]} address={ADDRESS} />);
    expect(screen.getByTestId('drafts-list')).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`)).toBeInTheDocument();
  });

  test('shows subject for drafts with subject', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('shows "(no subject)" for drafts without subject', () => {
    render(<DraftsList drafts={[NO_SUBJECT_DRAFT]} address={ADDRESS} />);
    expect(screen.getByText('(no subject)')).toBeInTheDocument();
  });

  test('shows recipient address', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    expect(screen.getByText('recipient@example.com')).toBeInTheDocument();
  });

  test('shows "No recipient" when to is missing', () => {
    const draft = { ...COMPOSE_DRAFT, to: undefined };
    render(<DraftsList drafts={[draft]} address={ADDRESS} />);
    expect(screen.getByText('No recipient')).toBeInTheDocument();
  });

  test('applies active styling to the currently open draft', () => {
    mockPathname.mockReturnValue(`/drafts/me%40hermes.com/${COMPOSE_DRAFT.draftId}`);
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    const card = screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`);
    expect(card.className).toContain('border-accent-foreground/20');
  });

  test('does not apply active styling to non-active drafts', () => {
    mockPathname.mockReturnValue(`/drafts/me%40hermes.com/${COMPOSE_DRAFT.draftId}`);
    render(<DraftsList drafts={[COMPOSE_DRAFT, REPLY_DRAFT]} address={ADDRESS} />);
    const inactiveCard = screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`);
    expect(inactiveCard.className).not.toContain('border-accent-foreground/20');
  });

  test('clicking new composition draft navigates to draft editor URL', async () => {
    const user = userEvent.setup();
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);

    await user.click(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`));

    expect(mockPush).toHaveBeenCalledWith(
      `/drafts/${encodeURIComponent(COMPOSE_DRAFT.from)}/${COMPOSE_DRAFT.draftId}`,
    );
  });

  test('clicking reply draft navigates to message with draftId and mode params', async () => {
    const user = userEvent.setup();
    render(<DraftsList drafts={[REPLY_DRAFT]} address={ADDRESS} />);

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
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete-button')).toBeInTheDocument();
  });

  test('does not show junk button for drafts', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    expect(screen.queryByTestId('bulk-junk-button')).not.toBeInTheDocument();
  });

  test('does not show mark read/unread buttons for drafts', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    expect(screen.queryByTestId('bulk-mark-read-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-mark-unread-button')).not.toBeInTheDocument();
  });

  test('delete button is disabled when nothing is selected', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    expect(screen.getByTestId('bulk-delete-button')).toBeDisabled();
  });

  test('clicking a draft checkbox selects it and enables delete button', async () => {
    const user = userEvent.setup();
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    await user.click(screen.getByLabelText('Select email'));
    expect(screen.getByTestId('bulk-delete-button')).not.toBeDisabled();
    expect(screen.getByTestId('selection-count')).toHaveTextContent('1 selected');
  });

  test('select all checkbox selects all drafts', async () => {
    const user = userEvent.setup();
    render(<DraftsList drafts={[COMPOSE_DRAFT, REPLY_DRAFT]} address={ADDRESS} />);
    await user.click(screen.getByTestId('select-all-checkbox'));
    expect(screen.getByTestId('selection-count')).toHaveTextContent('2 selected');
  });

  test('bulk delete calls DELETE for each selected draft and removes them from list', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<DraftsList drafts={[COMPOSE_DRAFT, REPLY_DRAFT]} address={ADDRESS} />);
    await user.click(screen.getByTestId('select-all-checkbox'));
    await user.click(screen.getByTestId('bulk-delete-button'));
    await waitFor(() => {
      expect(screen.queryByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`draft-row-${REPLY_DRAFT.draftId}`)).not.toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/drafts/'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  test('bulk delete rolls back drafts that fail', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<DraftsList drafts={[COMPOSE_DRAFT]} address={ADDRESS} />);
    await user.click(screen.getByLabelText('Select email'));
    await user.click(screen.getByTestId('bulk-delete-button'));
    await waitFor(() => {
      expect(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`)).toBeInTheDocument();
    });
  });
});
