import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddAddressDialog } from '@/components/addresses/add-address-dialog';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({ refresh: jest.fn() }),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="dialog">{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) =>
    <div data-testid="dialog-trigger">{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value, disabled }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
    disabled?: boolean;
  }) => (
    <div>
      <select
        data-testid="domain-select"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        aria-label="Domain"
        disabled={disabled}
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="">{placeholder}</option>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    <option value={value}>{children}</option>,
}));

const DOMAINS = ['example.com', 'test.io'];

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('AddAddressDialog', () => {
  test('renders trigger button', () => {
    render(<AddAddressDialog domains={DOMAINS} onSuccess={jest.fn()} />);
    expect(screen.getByRole('button', { name: /add address/i })).toBeInTheDocument();
  });

  test('renders custom trigger when provided', () => {
    render(
      <AddAddressDialog
        domains={DOMAINS}
        onSuccess={jest.fn()}
        trigger={<button>Custom trigger</button>}
      />,
    );
    expect(screen.getByRole('button', { name: /custom trigger/i })).toBeInTheDocument();
  });

  test('shows local part input and domain select', () => {
    render(<AddAddressDialog domains={DOMAINS} onSuccess={jest.fn()} />);
    expect(screen.getByLabelText(/local part/i)).toBeInTheDocument();
    expect(screen.getByTestId('domain-select')).toBeInTheDocument();
  });

  test('populates domain select with provided domains', () => {
    render(<AddAddressDialog domains={DOMAINS} onSuccess={jest.fn()} />);
    const select = screen.getByTestId('domain-select');
    expect(select).toContainHTML('example.com');
    expect(select).toContainHTML('test.io');
  });

  test('pre-selects defaultDomain when provided', () => {
    render(<AddAddressDialog domains={DOMAINS} onSuccess={jest.fn()} defaultDomain="test.io" />);
    const select = screen.getByTestId('domain-select') as HTMLSelectElement;
    expect(select.value).toBe('test.io');
  });

  test('disables domain select when defaultDomain is provided', () => {
    render(<AddAddressDialog domains={DOMAINS} onSuccess={jest.fn()} defaultDomain="test.io" />);
    expect(screen.getByTestId('domain-select')).toBeDisabled();
  });

  test('calls POST /api/addresses with correct email on submit', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<AddAddressDialog domains={DOMAINS} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/local part/i), 'hello');
    await user.selectOptions(screen.getByTestId('domain-select'), 'example.com');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/addresses', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'hello@example.com' }),
      }));
    });
  });

  test('calls onSuccess after successful submit', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<AddAddressDialog domains={DOMAINS} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/local part/i), 'hello');
    await user.selectOptions(screen.getByTestId('domain-select'), 'example.com');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  test('shows error alert on API failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Domain not verified' }),
    });
    const user = userEvent.setup();
    render(<AddAddressDialog domains={DOMAINS} onSuccess={jest.fn()} />);

    await user.type(screen.getByLabelText(/local part/i), 'hello');
    await user.selectOptions(screen.getByTestId('domain-select'), 'example.com');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Domain not verified')).toBeInTheDocument();
    });
  });

  test('shows no-domains alert when domains list is empty', () => {
    render(<AddAddressDialog domains={[]} onSuccess={jest.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/no verified domains yet/i)).toBeInTheDocument();
  });
});
