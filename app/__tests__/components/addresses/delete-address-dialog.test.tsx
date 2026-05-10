import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteAddressDialog } from '@/components/addresses/delete-address-dialog';

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="alert-trigger">{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

beforeEach(() => {
  global.fetch = jest.fn();
  jest.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('DeleteAddressDialog', () => {
  test('renders Delete trigger button', () => {
    render(<DeleteAddressDialog email="hello@example.com" onSuccess={jest.fn()} />);
    const trigger = screen.getByTestId('alert-trigger');
    expect(within(trigger).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  test('shows confirmation dialog with email and warning text', () => {
    render(<DeleteAddressDialog email="hello@example.com" onSuccess={jest.fn()} />);
    expect(screen.getByText('Delete address')).toBeInTheDocument();
    expect(screen.getByText(/hello@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  test('shows Cancel and Delete actions in dialog content', () => {
    render(<DeleteAddressDialog email="hello@example.com" onSuccess={jest.fn()} />);
    const content = screen.getByTestId('alert-content');
    expect(within(content).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(within(content).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  test('calls DELETE /api/addresses/:email on confirm', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<DeleteAddressDialog email="hello@example.com" onSuccess={onSuccess} />);

    const content = screen.getByTestId('alert-content');
    await user.click(within(content).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/addresses/hello%40example.com',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  test('calls onSuccess after successful delete', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    render(<DeleteAddressDialog email="hello@example.com" onSuccess={onSuccess} />);

    const content = screen.getByTestId('alert-content');
    await user.click(within(content).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  test('shows alert on API failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Address not found' }),
    });
    const user = userEvent.setup();
    render(<DeleteAddressDialog email="hello@example.com" onSuccess={jest.fn()} />);

    const content = screen.getByTestId('alert-content');
    await user.click(within(content).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Address not found');
    });
  });
});
