'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWs } from '@/components/ws-context';
import { useCompose } from '@/components/compose-context';

import { Mail, Settings, LogOut, PenSquare, Globe, AtSign, Inbox, Send, Loader2, BookMarked } from 'lucide-react';

import { cn } from '@/lib/utils';

interface NavLinkInnerProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  size?: 'default' | 'sm';
}

function NavLinkInner({ icon: Icon, label, isActive, size = 'default' }: NavLinkInnerProps) {
  const { pending } = useLinkStatus();
  const active = isActive || pending;
  const iconClass = cn('shrink-0', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4');

  return (
    <span
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 text-sm transition-colors',
        size === 'sm' ? 'py-1' : 'py-1.5',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {pending ? <Loader2 className={cn(iconClass, 'animate-spin')} /> : <Icon className={iconClass} />}
      {label}
    </span>
  );
}

interface Address {
  email: string;
  domain: string;
  status: string;
  unreadCount?: number;
}

interface SidebarProps {
  addresses: Address[];
}

export function Sidebar({ addresses }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribe } = useWs();

  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const addr of addresses) {
      if (addr.unreadCount && addr.unreadCount > 0) {
        map.set(addr.email, addr.unreadCount);
      }
    }
    return map;
  });

  useEffect(() => {
    return subscribe((event) => {
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(event.address, (next.get(event.address) ?? 0) + 1);
        return next;
      });
    });
  }, [subscribe]);
  const { openCompose } = useCompose();

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <TooltipProvider>
      <aside className="flex h-full w-64 flex-col border-r bg-background">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/" className="text-lg font-semibold hover:opacity-75 transition-opacity">
            Hermes
          </Link>
        </div>

        <div className="flex flex-col gap-1 p-3">
          <Button
            variant="default"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => openCompose()}
            data-testid="compose-button"
          >
            <PenSquare className="h-4 w-4" />
            Compose
          </Button>
        </div>

        <Separator />

        <nav className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Inboxes
          </p>
          <ul className="space-y-1">
            {addresses.map((addr) => {
              const inboxHref = `/inbox/${encodeURIComponent(addr.email)}`;
              const sentHref = `/sent/${encodeURIComponent(addr.email)}`;
              const draftsHref = `/drafts/${encodeURIComponent(addr.email)}`;
              const inboxActive = pathname.startsWith(inboxHref);
              const sentActive = pathname.startsWith(sentHref);
              const draftsActive = pathname.startsWith(draftsHref);
              const isAddressActive = inboxActive || sentActive || draftsActive;
              const count = unreadCounts.get(addr.email) ?? 0;
              return (
                <li key={addr.email}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                          isAddressActive
                            ? 'text-accent-foreground font-medium'
                            : 'text-muted-foreground',
                        )}
                      >
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{addr.email}</span>
                        {count > 0 ? (
                          <Badge variant="default" className="ml-auto h-5 shrink-0 text-xs">
                            {count}
                          </Badge>
                        ) : null}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">{addr.email}</TooltipContent>
                  </Tooltip>
                  <ul className="ml-6 mt-0.5 space-y-0.5">
                    <li>
                      <Link href={inboxHref} className="block">
                        <NavLinkInner icon={Inbox} label="Inbox" isActive={inboxActive} size="sm" />
                      </Link>
                    </li>
                    <li>
                      <Link href={sentHref} className="block">
                        <NavLinkInner icon={Send} label="Sent" isActive={sentActive} size="sm" />
                      </Link>
                    </li>
                    <li>
                      <Link href={draftsHref} className="block">
                        <NavLinkInner icon={BookMarked} label="Drafts" isActive={draftsActive} size="sm" />
                      </Link>
                    </li>
                  </ul>
                </li>
              );
            })}
            {addresses.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">No addresses yet</li>
            )}
          </ul>

          <Separator className="my-3" />

          <ul className="space-y-1">
            <li>
              <Link href="/addresses" className="block">
                <NavLinkInner icon={AtSign} label="Addresses" isActive={pathname === '/addresses'} />
              </Link>
            </li>
            <li>
              <Link href="/domains" className="block">
                <NavLinkInner icon={Globe} label="Domains" isActive={pathname === '/domains'} />
              </Link>
            </li>
            <li>
              <Link href="/settings" className="block">
                <NavLinkInner icon={Settings} label="Settings" isActive={pathname === '/settings'} />
              </Link>
            </li>
          </ul>
        </nav>

        <Separator />

        <div className="p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
