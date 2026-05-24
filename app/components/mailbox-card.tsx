import { Badge } from '@/components/ui/badge';
import { Loader2, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MailboxCardProps {
  testId: string;
  isActive: boolean;
  isLoading?: boolean;
  isUnread?: boolean;
  displayName: string;
  date: string;
  subject?: string;
  snippet?: string;
  hasAttachments?: boolean;
  onClick: () => void;
}

export function MailboxCard({
  testId,
  isActive,
  isLoading = false,
  isUnread = false,
  displayName,
  date,
  subject,
  snippet,
  hasAttachments = false,
  onClick,
}: MailboxCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left flex flex-col gap-1 px-3 py-3 rounded-lg cursor-pointer transition-colors border border-border',
        isActive
          ? 'bg-accent border-accent-foreground/20'
          : 'hover:bg-accent/60',
        isUnread && !isActive && 'bg-accent/20',
      )}
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isUnread && (
            <Badge variant="default" className="h-2 w-2 shrink-0 rounded-full p-0" aria-label="Unread" />
          )}
          <span className={cn(
            'text-sm truncate text-muted-foreground',
            isActive ? 'text-muted-background' : '',
            isUnread ? 'font-semibold' : 'font-medium',
          )}>
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
          {isLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : hasAttachments && <Paperclip className="h-3 w-3" />
          }
          <span>{date}</span>
        </div>
      </div>

      <span className={cn(
        'text-xs truncate',
        isUnread ? 'font-medium text-foreground/90' : 'text-muted-foreground',
      )}>
        {subject || '(no subject)'}
      </span>

      {snippet && (
        <span className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {snippet}
        </span>
      )}
    </button>
  );
}

export function formatMailboxDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
