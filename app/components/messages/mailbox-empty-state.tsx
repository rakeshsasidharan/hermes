import { Mail } from 'lucide-react';

export function MailboxEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground h-full">
      <Mail className="h-12 w-12 opacity-20" />
      <p className="text-sm">Select a message to read</p>
    </div>
  );
}
