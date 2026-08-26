import { render } from '@testing-library/react';
import Loading from '@/app/(app)/loading';

describe('App loading', () => {
  test('renders a spinner', () => {
    const { container } = render(<Loading />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
