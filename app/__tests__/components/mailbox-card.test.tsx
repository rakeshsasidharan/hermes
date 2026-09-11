import { render, screen } from '@testing-library/react';
import { MailboxCard } from '@/components/mailbox-card';

const BASE_PROPS = {
  testId: 'message-row-1',
  isActive: false,
  displayName: 'Jane Doe',
  date: '10:00 AM',
  subject: 'Hello',
  onClick: jest.fn(),
};

describe('MailboxCard', () => {
  test('unread row has no background tint, only the unread marker', () => {
    render(<MailboxCard {...BASE_PROPS} isUnread />);
    const row = screen.getByTestId('message-row-1');
    expect(row.className).not.toMatch(/bg-accent\/20/);
    expect(screen.getByLabelText('Unread')).toBeInTheDocument();
  });

  test('selected row keeps its background tint', () => {
    render(<MailboxCard {...BASE_PROPS} isSelected />);
    const row = screen.getByTestId('message-row-1');
    expect(row.className).toMatch(/bg-accent\/30/);
  });

  test('active row keeps its full background', () => {
    render(<MailboxCard {...BASE_PROPS} isActive isUnread />);
    const row = screen.getByTestId('message-row-1');
    expect(row.className).toMatch(/bg-accent(?!\/)/);
    expect(row.className).not.toMatch(/bg-accent\/20/);
  });
});
