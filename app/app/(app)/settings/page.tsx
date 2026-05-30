import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SettingsView } from '@/components/settings/settings-view';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

interface Domain {
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

interface Address {
  email: string;
  domain: string;
  status: string;
  createdAt: string;
}

interface Message {
  messageId: string;
  address: string;
  sender: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
}

async function fetchDomains(cookieHeader: string): Promise<Domain[]> {
  const res = await fetch(`${BASE}/api/domains`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  return res.ok ? ((await res.json()).domains ?? []) : [];
}

async function fetchAddresses(cookieHeader: string): Promise<Address[]> {
  const res = await fetch(`${BASE}/api/addresses`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  return res.ok ? ((await res.json()).addresses ?? []) : [];
}

async function fetchMessageCounts(
  cookieHeader: string,
  addresses: Address[],
): Promise<{ total: number; unread: number }> {
  if (addresses.length === 0) return { total: 0, unread: 0 };
  const counts = await Promise.all(
    addresses.map(async (addr) => {
      const res = await fetch(
        `${BASE}/api/messages/count?address=${encodeURIComponent(addr.email)}`,
        { headers: { Cookie: cookieHeader }, cache: 'no-store' },
      );
      return res.ok
        ? ((await res.json()) as { total: number; unread: number })
        : { total: 0, unread: 0 };
    }),
  );
  return counts.reduce(
    (acc, cur) => ({ total: acc.total + cur.total, unread: acc.unread + cur.unread }),
    { total: 0, unread: 0 },
  );
}

async function fetchRecentMessages(
  cookieHeader: string,
  addresses: Address[],
): Promise<Message[]> {
  if (addresses.length === 0) return [];
  const perAddress = await Promise.all(
    addresses.map(async (addr) => {
      const res = await fetch(
        `${BASE}/api/messages?address=${encodeURIComponent(addr.email)}&direction=inbound&limit=5`,
        { headers: { Cookie: cookieHeader }, cache: 'no-store' },
      );
      return res.ok ? ((await res.json()).messages ?? []) : [];
    }),
  );
  return perAddress
    .flat()
    .sort(
      (a: Message, b: Message) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )
    .slice(0, 5);
}

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [domains, addresses] = await Promise.all([
    fetchDomains(cookieHeader),
    fetchAddresses(cookieHeader),
  ]);

  const [messageCounts, recentMessages] = await Promise.all([
    fetchMessageCounts(cookieHeader, addresses),
    fetchRecentMessages(cookieHeader, addresses),
  ]);

  return (
    <SettingsView
      domains={domains}
      addresses={addresses}
      messageCounts={messageCounts}
      recentMessages={recentMessages}
    />
  );
}
