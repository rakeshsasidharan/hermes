'use client';

import { usePathname } from 'next/navigation';
import { Topbar } from './topbar';

const MAILBOX_PATTERN = /^\/(inbox|sent|drafts|junk|trash)\//;

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // `/` only ever renders the inbox skeleton while redirecting to the default
  // inbox, so it shares the mailbox wrapper to avoid a layout shift.
  const isMailbox = pathname === '/' || MAILBOX_PATTERN.test(pathname);

  return (
    <>
      <Topbar />
      {isMailbox ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>
      ) : (
        <div className="flex flex-col flex-1 overflow-y-auto px-6 pb-6 pt-3">{children}</div>
      )}
    </>
  );
}
