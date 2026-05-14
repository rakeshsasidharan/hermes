import { render, screen } from '@testing-library/react';
import { DomainList } from '@/components/domains/domain-list';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({ refresh: jest.fn() }),
}));

jest.mock('@/components/domains/add-domain-dialog', () => ({
  AddDomainDialog: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={onSuccess}>Add domain</button>
  ),
}));

const DOMAINS = [
  { domain: 'example.com', status: 'Verified' as const },
  { domain: 'pending.com', status: 'Pending' as const },
  { domain: 'failed.com', status: 'Failed' as const },
];

describe('DomainList', () => {
  test('renders all domain rows', () => {
    render(<DomainList domains={DOMAINS} />);
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('pending.com')).toBeInTheDocument();
    expect(screen.getByText('failed.com')).toBeInTheDocument();
  });

  test('shows Verified badge for verified domain', () => {
    render(<DomainList domains={DOMAINS} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  test('shows Pending badge for pending domain', () => {
    render(<DomainList domains={DOMAINS} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  test('shows Failed badge for failed domain', () => {
    render(<DomainList domains={DOMAINS} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  test('shows empty state when no domains', () => {
    render(<DomainList domains={[]} />);
    expect(screen.getByText(/no domains yet/i)).toBeInTheDocument();
  });

  test('renders Add domain button', () => {
    render(<DomainList domains={[]} />);
    expect(screen.getByRole('button', { name: /add domain/i })).toBeInTheDocument();
  });
});
