import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/sidebar';
import { ConditionalLayout } from '@/components/layout/conditional-layout';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { WebSocketProvider } from '@/components/ws-context';
import { SIDEBAR_STATE_COOKIE } from '@/lib/preferences';
import { verifyToken } from '@/lib/auth/require-auth';
import { queryAddresses } from '@/lib/data/addresses';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    redirect('/login');
  }

  try {
    await verifyToken(token);
  } catch {
    redirect('/login');
  }

  const addresses = await queryAddresses();
  const wsEndpoint = process.env.NEXT_PUBLIC_WEBSOCKET_ENDPOINT ?? '';

  const sidebarStateCookie = cookieStore.get(SIDEBAR_STATE_COOKIE)?.value;
  const defaultSidebarOpen = sidebarStateCookie === undefined ? true : sidebarStateCookie === 'true';

  return (
    <WebSocketProvider token={token} wsEndpoint={wsEndpoint}>
      <SidebarProvider className="h-svh" defaultOpen={defaultSidebarOpen}>
        <AppSidebar addresses={addresses} />
        <SidebarInset className="flex flex-col min-h-0 overflow-hidden">
          <ConditionalLayout>{children}</ConditionalLayout>
        </SidebarInset>
      </SidebarProvider>
    </WebSocketProvider>
  );
}
