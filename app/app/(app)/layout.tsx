import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/sidebar';
import { ConditionalLayout } from '@/components/layout/conditional-layout';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { WebSocketProvider } from '@/components/ws-context';
import { SIDEBAR_STATE_COOKIE } from '@/lib/preferences';

interface Address {
  email: string;
  domain: string;
  status: string;
  unreadCount?: number;
}

async function getAddresses(token: string): Promise<Address[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/addresses`, {
    headers: { Cookie: `access_token=${token}` },
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
  }

  if (!res.ok) return [];

  const data = await res.json();
  return data.addresses ?? [];
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    redirect('/login');
  }

  const addresses = await getAddresses(token);
  const wsEndpoint = process.env.NEXT_PUBLIC_WEBSOCKET_ENDPOINT ?? '';

  const sidebarStateCookie = cookieStore.get(SIDEBAR_STATE_COOKIE)?.value;
  const defaultSidebarOpen = sidebarStateCookie === undefined ? true : sidebarStateCookie === 'true';

  return (
    <WebSocketProvider token={token} wsEndpoint={wsEndpoint}>
      <SidebarProvider className="h-svh" defaultOpen={defaultSidebarOpen}>
        <AppSidebar addresses={addresses} />
        <SidebarInset className="flex flex-col min-h-0">
          <ConditionalLayout>{children}</ConditionalLayout>
        </SidebarInset>
      </SidebarProvider>
    </WebSocketProvider>
  );
}
