import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/app/login/login-form';

// ── Mock server action ────────────────────────────────────────────────────────
const mockLoginAction = jest.fn();
jest.mock('@/app/login/actions', () => ({
  loginAction: (...args: unknown[]) => mockLoginAction(...args),
}));

// React's useActionState needs to be shimmed for jsdom
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useActionState: (
    action: (state: unknown, formData: FormData) => Promise<unknown>,
    initialState: unknown,
  ) => {
    const [state, setState] = jest.requireActual('react').useState(initialState);
    const dispatch = async (formData: FormData) => {
      const newState = await action(state, formData);
      setState(newState);
    };
    return [state, dispatch, false];
  },
}));

describe('LoginForm', () => {
  beforeEach(() => {
    mockLoginAction.mockReset();
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

  test('does not show error alert on initial render', () => {
    render(<LoginForm />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
