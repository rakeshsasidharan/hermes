import { render, screen } from '@testing-library/react';
import { Topbar } from '@/components/layout/topbar';
import { SidebarProvider } from '@/components/ui/sidebar';

const { usePathname } = jest.requireMock('next/navigation');

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/'),
}));

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

function renderTopbar() {
  return render(
    <SidebarProvider>
      <Topbar />
    </SidebarProvider>,
  );
}

describe('Topbar', () => {
  test('shows Hermes for root path', () => {
    usePathname.mockReturnValue('/');
    renderTopbar();
    expect(screen.getByText('Hermes')).toBeInTheDocument();
  });

  test('shows Drafts for /drafts', () => {
    usePathname.mockReturnValue('/drafts');
    renderTopbar();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
  });

  test('shows Settings for /settings', () => {
    usePathname.mockReturnValue('/settings');
    renderTopbar();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('shows address email for inbox route', () => {
    usePathname.mockReturnValue('/inbox/hello%40example.com');
    renderTopbar();
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
  });

  test('shows address email for message detail route', () => {
    usePathname.mockReturnValue('/inbox/hello%40example.com/msg-123');
    renderTopbar();
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
  });
});
