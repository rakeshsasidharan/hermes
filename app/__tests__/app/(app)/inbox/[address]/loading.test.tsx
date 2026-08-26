import { render } from '@testing-library/react';
import InboxLoading from '@/app/(app)/inbox/[address]/loading';

describe('Inbox loading', () => {
  test('renders list skeleton rows and a detail spinner', () => {
    const { container } = render(<InboxLoading />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
