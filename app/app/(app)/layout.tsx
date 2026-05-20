import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { WebSocketProvider } from '@/components/ws-context';
import { ComposeProvider } from '@/components/compose-context';
import { ComposeSheet } from '@/components/messages/compose-sheet';

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

  return (
    <WebSocketProvider token={token} wsEndpoint={wsEndpoint}>
      <ComposeProvider>
        <SidebarProvider className="h-svh">
          <AppSidebar addresses={addresses} />
          <SidebarInset>
            <Topbar />
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3">{children}</div>
          </SidebarInset>
        </SidebarProvider>
        <ComposeSheet addresses={addresses} />
      </ComposeProvider>
    </WebSocketProvider>
  );
}
