import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordDialog } from '@/components/settings/change-password-dialog';

function renderDialog() {
  return render(
    <ChangePasswordDialog trigger={<button data-testid="open-btn">Change password</button>} />,
  );
}

beforeEach(() => {
  global.fetch = jest.fn();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('ChangePasswordDialog', () => {
  test('opens dialog on trigger click', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDialog();
    await user.click(screen.getByTestId('open-btn'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('current-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('new-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument();
  });

  test('shows error when new passwords do not match', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDialog();
    await user.click(screen.getByTestId('open-btn'));
    await user.type(screen.getByTestId('current-password-input'), 'OldPass123!');
    await user.type(screen.getByTestId('new-password-input'), 'NewPass123!');
    await user.type(screen.getByTestId('confirm-password-input'), 'DifferentPass!');
    await user.click(screen.getByTestId('change-password-submit'));
    expect(screen.getByTestId('change-password-error')).toHaveTextContent(
      'New passwords do not match',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('shows error when new password is too short', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDialog();
    await user.click(screen.getByTestId('open-btn'));
    await user.type(screen.getByTestId('current-password-input'), 'OldPass123!');
    await user.type(screen.getByTestId('new-password-input'), 'short');
    await user.type(screen.getByTestId('confirm-password-input'), 'short');
    await user.click(screen.getByTestId('change-password-submit'));
    expect(screen.getByTestId('change-password-error')).toHaveTextContent(
      'at least 8 characters',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('calls API and shows success on valid submission', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDialog();
    await user.click(screen.getByTestId('open-btn'));
    await user.type(screen.getByTestId('current-password-input'), 'OldPass123!');
    await user.type(screen.getByTestId('new-password-input'), 'NewPass123!');
    await user.type(screen.getByTestId('confirm-password-input'), 'NewPass123!');
    await user.click(screen.getByTestId('change-password-submit'));
    await waitFor(() =>
      expect(screen.getByText('Password changed successfully.')).toBeInTheDocument(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/change-password',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('shows API error message on failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Incorrect username or password.' }),
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDialog();
    await user.click(screen.getByTestId('open-btn'));
    await user.type(screen.getByTestId('current-password-input'), 'WrongPass!');
    await user.type(screen.getByTestId('new-password-input'), 'NewPass123!');
    await user.type(screen.getByTestId('confirm-password-input'), 'NewPass123!');
    await user.click(screen.getByTestId('change-password-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('change-password-error')).toHaveTextContent(
        'Incorrect username or password.',
      ),
    );
  });

  test('resets form when dialog is closed and reopened', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDialog();
    await user.click(screen.getByTestId('open-btn'));
    await user.type(screen.getByTestId('current-password-input'), 'OldPass123!');
    await user.type(screen.getByTestId('new-password-input'), 'Bad');
    await user.type(screen.getByTestId('confirm-password-input'), 'Mismatch');
    await user.click(screen.getByTestId('change-password-submit'));
    expect(screen.getByTestId('change-password-error')).toBeInTheDocument();
    // Close
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    // Reopen
    await user.click(screen.getByTestId('open-btn'));
    expect(screen.queryByTestId('change-password-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-password-input')).toHaveValue('');
  });
});
