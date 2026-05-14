import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddDomainDialog } from '@/components/domains/add-domain-dialog';

beforeEach(() => {
  global.fetch = jest.fn();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

function renderDialog(onSuccess = jest.fn()) {
  return render(<AddDomainDialog onSuccess={onSuccess} />);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /add domain/i }));
}

describe('AddDomainDialog', () => {
  describe('form submission', () => {
    test('opens dialog when trigger button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderDialog();
      await openDialog(user);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    test('shows pending status panel after successful setup submission', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ ses: 'Pending', dkim: 'Pending' }),
        });

      renderDialog();
      await openDialog(user);

      await user.type(screen.getByPlaceholderText(/example\.com/i), 'mysite.com');
      await user.click(screen.getByRole('button', { name: /set up domain/i }));

      await waitFor(() => {
        expect(screen.getByText(/verifying/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/SES verification/i)).toBeInTheDocument();
      expect(screen.getByText(/DKIM/i)).toBeInTheDocument();
    });

    test('shows error alert when setup request fails', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Domain is already verified in SES' }),
      });

      renderDialog();
      await openDialog(user);

      await user.type(screen.getByPlaceholderText(/example\.com/i), 'taken.com');
      await user.click(screen.getByRole('button', { name: /set up domain/i }));

      await waitFor(() => {
        expect(screen.getByText(/domain is already verified in ses/i)).toBeInTheDocument();
      });
    });

    test('shows error when form is submitted with empty domain', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderDialog();
      await openDialog(user);

      await user.click(screen.getByRole('button', { name: /set up domain/i }));

      expect(screen.getByText(/domain name is required/i)).toBeInTheDocument();
    });
  });

  describe('status panel polling', () => {
    test('status panel shows Pending badges initially after submission', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ ses: 'Pending', dkim: 'Pending' }),
        });

      renderDialog();
      await openDialog(user);
      await user.type(screen.getByPlaceholderText(/example\.com/i), 'mysite.com');
      await user.click(screen.getByRole('button', { name: /set up domain/i }));

      await waitFor(() => {
        expect(screen.getAllByText('Pending')).toHaveLength(2);
      });
    });

    test('calls onSuccess and shows success alert when both statuses become Verified', async () => {
      const onSuccess = jest.fn();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ ses: 'Verified', dkim: 'Verified' }),
        });

      renderDialog(onSuccess);
      await openDialog(user);
      await user.type(screen.getByPlaceholderText(/example\.com/i), 'mysite.com');
      await user.click(screen.getByRole('button', { name: /set up domain/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByText(/domain verified successfully/i)).toBeInTheDocument();
    });

    test('shows Failed badge when SES status is Failed', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ ses: 'Failed', dkim: 'Pending' }),
        });

      renderDialog();
      await openDialog(user);
      await user.type(screen.getByPlaceholderText(/example\.com/i), 'mysite.com');
      await user.click(screen.getByRole('button', { name: /set up domain/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    test('polls for status updates every 5 seconds', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ ses: 'Pending', dkim: 'Pending' }),
        });

      renderDialog();
      await openDialog(user);
      await user.type(screen.getByPlaceholderText(/example\.com/i), 'mysite.com');
      await user.click(screen.getByRole('button', { name: /set up domain/i }));

      await waitFor(() => {
        expect(screen.getByText(/verifying/i)).toBeInTheDocument();
      });

      const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      await waitFor(() => {
        expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });
});
