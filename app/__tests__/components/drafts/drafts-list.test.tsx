import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftsList } from '@/components/drafts/drafts-list';

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue('/drafts/me%40hermes.com');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname(),
}));

jest.mock('@/lib/navigation-guard', () => ({
  tryNavigate: jest.fn((fn: () => void) => fn()),
}));

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
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('DraftsList', () => {
  test('shows empty state when no drafts', () => {
    render(<DraftsList drafts={[]} />);
    expect(screen.getByTestId('drafts-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no drafts saved yet/i)).toBeInTheDocument();
  });

  test('renders draft cards when drafts exist', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT, REPLY_DRAFT]} />);
    expect(screen.getByTestId('drafts-list')).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`)).toBeInTheDocument();
  });

  test('shows subject for drafts with subject', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('shows "(no subject)" for drafts without subject', () => {
    render(<DraftsList drafts={[NO_SUBJECT_DRAFT]} />);
    expect(screen.getByText('(no subject)')).toBeInTheDocument();
  });

  test('shows recipient address', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);
    expect(screen.getByText('recipient@example.com')).toBeInTheDocument();
  });

  test('shows "No recipient" when to is missing', () => {
    const draft = { ...COMPOSE_DRAFT, to: undefined };
    render(<DraftsList drafts={[draft]} />);
    expect(screen.getByText('No recipient')).toBeInTheDocument();
  });

  test('applies active styling to the currently open draft', () => {
    mockPathname.mockReturnValue(`/drafts/me%40hermes.com/${COMPOSE_DRAFT.draftId}`);
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);
    const card = screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`);
    expect(card.className).toContain('border-accent-foreground/20');
  });

  test('does not apply active styling to non-active drafts', () => {
    mockPathname.mockReturnValue(`/drafts/me%40hermes.com/${COMPOSE_DRAFT.draftId}`);
    render(<DraftsList drafts={[COMPOSE_DRAFT, REPLY_DRAFT]} />);
    const inactiveCard = screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`);
    expect(inactiveCard.className).not.toContain('border-accent-foreground/20');
  });

  test('clicking new composition draft navigates to draft editor URL', async () => {
    const user = userEvent.setup();
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);

    await user.click(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`));

    expect(mockPush).toHaveBeenCalledWith(
      `/drafts/${encodeURIComponent(COMPOSE_DRAFT.from)}/${COMPOSE_DRAFT.draftId}`,
    );
  });

  test('clicking reply draft navigates to message with draftId and mode params', async () => {
    const user = userEvent.setup();
    render(<DraftsList drafts={[REPLY_DRAFT]} />);

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
