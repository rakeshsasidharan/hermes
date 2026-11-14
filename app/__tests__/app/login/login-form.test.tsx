import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/app/login/login-form';

const mockLoginAction = jest.fn();
jest.mock('@/app/login/actions', () => ({
  loginAction: (...args: unknown[]) => mockLoginAction(...args),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    mockLoginAction.mockReset();
    mockPush.mockReset();
  });

  test('renders username and password fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  test('renders sign in button', () => {
    render(<LoginForm />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('does not show error alert on initial render', () => {
    render(<LoginForm />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows error alert when action returns an error', async () => {
    mockLoginAction.mockResolvedValueOnce({ error: 'Invalid username or password.' });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Invalid username or password.')).toBeInTheDocument();
    });
  });

  test('clears password field on error', async () => {
    mockLoginAction.mockResolvedValueOnce({ error: 'Invalid username or password.' });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/password/i)).toHaveValue('');
    });
  });

  test('keeps the username after a failed login', async () => {
    mockLoginAction.mockResolvedValueOnce({ error: 'Invalid username or password.' });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password.')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/username/i)).toHaveValue('admin');
  });

  test('submits username and password as form data to the login action', async () => {
    mockLoginAction.mockResolvedValueOnce({ success: true });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLoginAction).toHaveBeenCalledTimes(1);
    });
    const formData = mockLoginAction.mock.calls[0][1] as FormData;
    expect(formData.get('username')).toBe('admin');
    expect(formData.get('password')).toBe('secret');
  });

  test('hides the previous error while a retry is in flight', async () => {
    mockLoginAction.mockResolvedValueOnce({ error: 'Invalid username or password.' });
    let resolveRetry!: (v: unknown) => void;
    mockLoginAction.mockImplementationOnce(() => new Promise((res) => { resolveRetry = res; }));

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/password/i), 'rightpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    await act(async () => {
      resolveRetry({ success: true });
    });
  });

  test('redirects to / on successful login', async () => {
    mockLoginAction.mockResolvedValueOnce({ success: true });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  test('password field retains value after successful login before navigation', async () => {
    mockLoginAction.mockResolvedValueOnce({ success: true });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'mypassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
    expect(screen.getByLabelText(/password/i)).toHaveValue('mypassword');
  });

  test('button shows spinner and is disabled while loading', async () => {
    let resolveAction!: (v: unknown) => void;
    mockLoginAction.mockImplementationOnce(() => new Promise((res) => { resolveAction = res; }));

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
      expect(screen.getByLabelText(/username/i)).toBeDisabled();
      expect(screen.getByLabelText(/password/i)).toBeDisabled();
    });

    await act(async () => {
      resolveAction({ success: true });
    });
  });

  test('button stays disabled after success state before navigation', async () => {
    mockLoginAction.mockResolvedValueOnce({ success: true });

    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    });
  });
});
