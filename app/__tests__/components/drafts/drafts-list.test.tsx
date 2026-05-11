import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DraftsList } from '@/components/drafts/drafts-list';

const mockPush = jest.fn();
const mockOpenCompose = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/compose-context', () => ({
  useCompose: () => ({ openCompose: mockOpenCompose, closeCompose: jest.fn(), isOpen: false, initialData: null }),
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
  mockOpenCompose.mockReset();
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

  test('renders draft rows when drafts exist', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT, REPLY_DRAFT]} />);
    expect(screen.getByTestId('drafts-list')).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`draft-row-${REPLY_DRAFT.draftId}`)).toBeInTheDocument();
  });

  test('shows subject for drafts with subject', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('shows "No subject" for drafts without subject', () => {
    render(<DraftsList drafts={[NO_SUBJECT_DRAFT]} />);
    expect(screen.getByText(/no subject/i)).toBeInTheDocument();
  });

  test('shows recipient address in To column', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);
    expect(screen.getByText('recipient@example.com')).toBeInTheDocument();
  });

  test('shows Reply badge for reply drafts', () => {
    render(<DraftsList drafts={[REPLY_DRAFT]} />);
    expect(screen.getByText('Reply')).toBeInTheDocument();
  });

  test('shows New badge for new composition drafts', () => {
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  test('clicking new composition draft opens Compose Sheet with restored fields', async () => {
    const user = userEvent.setup();
    render(<DraftsList drafts={[COMPOSE_DRAFT]} />);

    await user.click(screen.getByTestId(`draft-row-${COMPOSE_DRAFT.draftId}`));

    expect(mockOpenCompose).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: COMPOSE_DRAFT.draftId,
        from: COMPOSE_DRAFT.from,
        to: COMPOSE_DRAFT.to,
        subject: COMPOSE_DRAFT.subject,
        body: COMPOSE_DRAFT.body,
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
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
    expect(mockOpenCompose).not.toHaveBeenCalled();
  });
});
