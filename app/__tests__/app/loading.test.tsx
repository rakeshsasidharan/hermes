import { render } from '@testing-library/react';
import Loading from '@/app/loading';

describe('Root loading', () => {
  test('renders a full-screen spinner', () => {
    const { container } = render(<Loading />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
