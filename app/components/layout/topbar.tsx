'use client';

import { usePathname } from 'next/navigation';

function getTitle(pathname: string): string {
  if (pathname === '/drafts') return 'Drafts';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/compose') return 'Compose';
  if (pathname === '/addresses') return 'Addresses';

  const inboxMatch = pathname.match(/^\/inbox\/([^/]+)(?:\/[^/]+)?$/);
  if (inboxMatch) {
    return decodeURIComponent(inboxMatch[1]);
  }

  return 'Hermes';
}

export function Topbar() {
  const pathname = usePathname();
  const title = getTitle(pathname);

  return (
    <header className="flex h-14 items-center border-b px-6">
      <h1 className="text-sm font-medium text-foreground truncate">{title}</h1>
    </header>
  );
}
