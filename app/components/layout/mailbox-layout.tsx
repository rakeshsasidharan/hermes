'use client';

interface MailboxLayoutProps {
  list: React.ReactNode;
  detail: React.ReactNode;
}

export function MailboxLayout({ list, detail }: MailboxLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="w-80 shrink-0 flex flex-col border-r overflow-hidden">
        {list}
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {detail}
      </div>
    </div>
  );
}
