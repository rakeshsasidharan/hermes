import { cookies } from 'next/headers';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, AtSign, Mail, Clock } from 'lucide-react';

interface Domain {
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

interface Address {
  email: string;
  domain: string;
  status: string;
}

interface Message {
  messageId: string;
  address: string;
  sender: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
}

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function fetchDomains(cookieHeader: string): Promise<Domain[]> {
  const res = await fetch(`${BASE}/api/domains`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  return res.ok ? ((await res.json()).domains ?? []) : [];
}

async function fetchAddresses(cookieHeader: string): Promise<Address[]> {
  const res = await fetch(`${BASE}/api/addresses`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  return res.ok ? ((await res.json()).addresses ?? []) : [];
}

async function fetchRecentMessages(
  cookieHeader: string,
  addresses: Address[],
): Promise<Message[]> {
  if (addresses.length === 0) return [];

  const perAddress = await Promise.all(
    addresses.map(async (addr) => {
      const url = `${BASE}/api/messages?address=${encodeURIComponent(addr.email)}&direction=inbound&limit=5`;
      const res = await fetch(url, {
        headers: { Cookie: cookieHeader },
        cache: 'no-store',
      });
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

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [domains, addresses] = await Promise.all([
    fetchDomains(cookieHeader),
    fetchAddresses(cookieHeader),
  ]);

  const recentMessages = await fetchRecentMessages(cookieHeader, addresses);

  const verified = domains.filter((d) => d.status === 'Verified').length;
  const pending = domains.filter((d) => d.status === 'Pending').length;
  const failed = domains.filter((d) => d.status === 'Failed').length;

  const totalMessages = recentMessages.length;
  const unreadMessages = recentMessages.filter((m) => !m.isRead).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your Hermes account</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Domains</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{domains.length}</p>
            <div className="mt-1 flex gap-2 flex-wrap">
              <Badge variant="default" className="text-xs">
                {verified} Verified
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {pending} Pending
              </Badge>
              {failed > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {failed} Failed
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Addresses</CardTitle>
            <AtSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{addresses.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Active addresses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalMessages}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {unreadMessages} unread
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No messages yet</p>
          ) : (
            <ul className="space-y-3">
              {recentMessages.map((msg) => (
                <li key={msg.messageId}>
                  <Link
                    href={`/inbox/${encodeURIComponent(msg.address)}/${msg.messageId}`}
                    className="flex items-start gap-3 rounded-md p-2 hover:bg-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm truncate ${!msg.isRead ? 'font-semibold' : 'font-normal'}`}
                        >
                          {msg.subject || '(no subject)'}
                        </span>
                        {!msg.isRead && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">
                          {msg.sender}
                        </span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {msg.address}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(msg.receivedAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
