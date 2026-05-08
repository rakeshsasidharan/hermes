import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddressList } from '@/components/addresses/address-list';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({ refresh: jest.fn() }),
}));

jest.mock('@/components/addresses/add-address-dialog', () => ({
  AddAddressDialog: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={onSuccess}>Add address</button>
  ),
}));

jest.mock('@/components/addresses/delete-address-dialog', () => ({
  DeleteAddressDialog: ({ email, onSuccess }: { email: string; onSuccess: () => void }) => (
    <button onClick={onSuccess}>Delete {email}</button>
  ),
}));

const ADDRESSES = [
  { email: 'hello@example.com', domain: 'example.com', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
  { email: 'info@example.com', domain: 'example.com', status: 'pending', createdAt: '2026-01-02T00:00:00Z' },
];

describe('AddressList', () => {
  test('renders address rows', () => {
    render(<AddressList addresses={ADDRESSES} domains={['example.com']} />);
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
    expect(screen.getByText('info@example.com')).toBeInTheDocument();
  });

  test('renders status badge for each address', () => {
    render(<AddressList addresses={ADDRESSES} domains={['example.com']} />);
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  test('shows empty state message when no addresses', () => {
    render(<AddressList addresses={[]} domains={['example.com']} />);
    expect(screen.getByText(/no addresses yet/i)).toBeInTheDocument();
  });

  test('removes address from list after successful delete', async () => {
    const user = userEvent.setup();
    render(<AddressList addresses={ADDRESSES} domains={['example.com']} />);

    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete hello@example.com/i }));

    await waitFor(() => {
      expect(screen.queryByText('hello@example.com')).not.toBeInTheDocument();
    });
  });

  test('renders Add address button', () => {
    render(<AddressList addresses={[]} domains={['example.com']} />);
    expect(screen.getByRole('button', { name: /add address/i })).toBeInTheDocument();
  });
});
