'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Mail, FileText, Settings, LogOut, PenSquare, AtSign, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <TooltipProvider>
      <aside className="flex h-full w-64 flex-col border-r bg-background">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-lg font-semibold">Hermes</span>
        </div>

        <div className="flex flex-col gap-1 p-3">
          <Button asChild variant="default" size="sm" className="w-full justify-start gap-2">
            <Link href="/compose">
              <PenSquare className="h-4 w-4" />
              Compose
            </Link>
          </Button>
        </div>

        <Separator />

        <nav className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Inboxes
          </p>
          <ul className="space-y-1">
            {addresses.map((addr) => {
              const href = `/inbox/${encodeURIComponent(addr.email)}`;
              const active = pathname.startsWith(href);
              return (
                <li key={addr.email}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{addr.email}</span>
                        {addr.unreadCount && addr.unreadCount > 0 ? (
                          <Badge variant="default" className="ml-auto h-5 shrink-0 text-xs">
                            {addr.unreadCount}
                          </Badge>
                        ) : null}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{addr.email}</TooltipContent>
                  </Tooltip>
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
              <Link
                href="/home"
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  pathname === '/home'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <AtSign className="h-4 w-4 shrink-0" />
                Addresses
              </Link>
            </li>
            <li>
              <Link
                href="/domains"
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  pathname === '/domains'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Globe className="h-4 w-4 shrink-0" />
                Domains
              </Link>
            </li>
            <li>
              <Link
                href="/drafts"
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  pathname === '/drafts'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <FileText className="h-4 w-4 shrink-0" />
                Drafts
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  pathname === '/settings'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                Settings
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
