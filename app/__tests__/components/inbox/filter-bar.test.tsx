import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '@/components/inbox/filter-bar';

describe('FilterBar', () => {
  test('renders filter inputs', () => {
    render(<FilterBar onFilter={jest.fn()} />);
    expect(screen.getByLabelText(/filter by sender/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by subject/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filter from date/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filter to date/i })).toBeInTheDocument();
  });

  test('calls onFilter with values on submit', async () => {
    const onFilter = jest.fn();
    const user = userEvent.setup();
    render(<FilterBar onFilter={onFilter} />);

    await user.type(screen.getByLabelText(/filter by sender/i), 'alice');
    await user.type(screen.getByLabelText(/filter by subject/i), 'hello');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(onFilter).toHaveBeenCalledWith(expect.objectContaining({
      sender: 'alice',
      subject: 'hello',
    }));
  });

  test('shows Clear button only when filters are active', async () => {
    const user = userEvent.setup();
    render(<FilterBar onFilter={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/filter by sender/i), 'alice');
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  test('clears filters and calls onFilter on clear click', async () => {
    const onFilter = jest.fn();
    const user = userEvent.setup();
    render(<FilterBar onFilter={onFilter} />);

    await user.type(screen.getByLabelText(/filter by sender/i), 'alice');
    await user.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => {
      expect(onFilter).toHaveBeenLastCalledWith({ sender: '', subject: '', from: '', to: '' });
    });
    expect(screen.getByLabelText(/filter by sender/i)).toHaveValue('');
  });
});
