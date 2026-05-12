import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
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
        <div className="flex h-screen overflow-hidden">
          <Sidebar addresses={addresses} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
        <ComposeSheet addresses={addresses} />
      </ComposeProvider>
    </WebSocketProvider>
  );
}
