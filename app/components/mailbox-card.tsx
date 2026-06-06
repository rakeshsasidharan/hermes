import { Badge } from '@/components/ui/badge';
import { Loader2, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MailboxCardProps {
  testId: string;
  isActive: boolean;
  isLoading?: boolean;
  isUnread?: boolean;
  isSelected?: boolean;
  displayName: string;
  date: string;
  subject?: string;
  snippet?: string;
  hasAttachments?: boolean;
  onClick: () => void;
  onSelectToggle?: () => void;
}

export function MailboxCard({
  testId,
  isActive,
  isLoading = false,
  isUnread = false,
  isSelected = false,
  displayName,
  date,
  subject,
  snippet,
  hasAttachments = false,
  onClick,
  onSelectToggle,
}: MailboxCardProps) {
  return (
    <div
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={cn(
        'group flex items-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors border border-border',
        isActive
          ? 'bg-accent border-accent-foreground/20'
          : 'hover:bg-accent/60',
        isUnread && !isActive && 'bg-accent/20',
        isSelected && !isActive && 'bg-accent/30',
      )}
    >
      {onSelectToggle && (
        <div
          className="flex items-center shrink-0"
          onClick={(e) => { e.stopPropagation(); onSelectToggle(); }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            className={cn(
              'h-4 w-4 rounded  cursor-pointer accent-primary',
              isSelected ? 'opacity-100' : 'opacity-50 group-hover:opacity-100',
            )}
            aria-label="Select email"
          />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-1">
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
      </div>
    </div>
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
