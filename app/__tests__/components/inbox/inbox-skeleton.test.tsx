import { render, screen } from '@testing-library/react';
import { InboxSkeleton } from '@/components/inbox/inbox-skeleton';

describe('InboxSkeleton', () => {
  test('renders list skeleton rows and a detail spinner', () => {
    const { container } = render(<InboxSkeleton />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  test('marks itself busy for assistive technology', () => {
    render(<InboxSkeleton />);
    expect(screen.getByLabelText('Loading inbox')).toHaveAttribute('aria-busy', 'true');
  });
});
