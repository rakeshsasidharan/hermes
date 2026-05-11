import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/sidebar';

const mockPush = jest.fn();
const mockPathname = jest.fn().mockReturnValue('/');
const mockOpenCompose = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/compose-context', () => ({
  useCompose: () => ({ openCompose: mockOpenCompose, closeCompose: jest.fn(), isOpen: false, initialData: null }),
}));

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: () => null,
}));

const ADDRESSES = [
  { email: 'hello@example.com', domain: 'example.com', status: 'active', unreadCount: 3 },
  { email: 'info@example.com', domain: 'example.com', status: 'active', unreadCount: 0 },
];

beforeEach(() => {
  global.fetch = jest.fn();
  mockPathname.mockReturnValue('/');
  mockPush.mockReset();
  mockOpenCompose.mockReset();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Sidebar', () => {
  test('renders address links', () => {
    render(<Sidebar addresses={ADDRESSES} />);
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
    expect(screen.getByText('info@example.com')).toBeInTheDocument();
  });

  test('shows unread count badge when unreadCount > 0', () => {
    render(<Sidebar addresses={ADDRESSES} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('shows empty state when no addresses', () => {
    render(<Sidebar addresses={[]} />);
    expect(screen.getByText(/no addresses yet/i)).toBeInTheDocument();
  });

  test('renders Compose, Drafts, Settings links', () => {
    render(<Sidebar addresses={ADDRESSES} />);
    expect(screen.getByText('Compose')).toBeInTheDocument();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('Compose button opens compose sheet via context', async () => {
    const user = userEvent.setup();
    render(<Sidebar addresses={ADDRESSES} />);

    await user.click(screen.getByTestId('compose-button'));

    expect(mockOpenCompose).toHaveBeenCalledTimes(1);
  });

  test('calls sign out on button click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<Sidebar addresses={ADDRESSES} />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' });
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
