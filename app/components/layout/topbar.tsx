'use client';

import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

function getTitle(pathname: string): string {
  if (pathname === '/drafts') return 'Drafts';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/compose') return 'Compose';
  if (pathname === '/addresses') return 'Addresses';

  const mailboxMatch = pathname.match(/^\/(inbox|sent)\/([^/]+)(?:\/[^/]+)?$/);
  if (mailboxMatch) {
    return decodeURIComponent(mailboxMatch[2]);
  }

  return 'Hermes';
}

export function Topbar() {
  const pathname = usePathname();
  const title = getTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <h1 className="text-sm font-medium text-foreground truncate">{title}</h1>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
