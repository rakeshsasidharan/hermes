'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Paperclip } from 'lucide-react';
import { useWs } from '@/components/ws-context';
import { cn } from '@/lib/utils';

interface Attachment {
  filename: string;
  s3Key: string;
}

interface Message {
  messageId: string;
  address: string;
  sender?: string;
  from?: string;
  to?: string;
  direction?: 'inbound' | 'outbound';
  subject: string;
  receivedAt: string;
  isRead: boolean;
  attachments?: Attachment[];
}

interface MessageListProps {
  address: string;
  direction: 'inbound' | 'outbound';
  initialMessages: Message[];
  initialNextCursor: string | null;
  folderLabel: string;
}

type Filter = 'all' | 'unread';

export function MessageList({ address, direction, initialMessages, initialNextCursor, folderLabel }: MessageListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { subscribe } = useWs();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [filter, setFilter] = useState<Filter>('all');
  const [isLoading, setIsLoading] = useState(false);

  const activeMessageId = (() => {
    const segments = pathname.split('/');
    return segments.length >= 4 ? segments[3] : null;
  })();

  useEffect(() => {
    if (direction !== 'inbound') return;
    return subscribe((event) => {
      if (event.address !== address) return;
      setMessages((prev) => {
        if (prev.some((m) => m.messageId === event.message.messageId)) return prev;
        return [event.message, ...prev];
      });
    });
  }, [subscribe, address, direction]);

  const fetchMessages = useCallback(async (cursor?: string) => {
    setIsLoading(true);
    const params = new URLSearchParams({ address, direction });
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(`/api/messages?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (cursor) {
        setMessages((prev) => [...prev, ...(data.messages ?? [])]);
      } else {
        setMessages(data.messages ?? []);
      }
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setIsLoading(false);
    }
  }, [address, direction]);

  function handleRowClick(msg: Message) {
    const root = direction === 'outbound' ? 'sent' : 'inbox';
    router.push(`/${root}/${encodeURIComponent(address)}/${msg.messageId}`);
  }

  const isSent = direction === 'outbound';

  function extractDisplayName(emailStr: string): string {
    const match = emailStr.match(/^(.+?)\s*<[^>]+>$/);
    const name = match ? match[1].trim() : emailStr;
    return name.replace(/^"|"$/g, '');
  }

  function formatDate(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  const displayed = filter === 'unread'
    ? messages.filter((m) => !m.isRead)
    : messages;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-4 h-14 shrink-0">
        <h2 className="font-semibold text-sm">{folderLabel}</h2>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            className="h-7 text-xs px-3"
            onClick={() => setFilter('all')}
            data-testid="filter-all"
          >
            All mail
          </Button>
          <Button
            size="sm"
            variant={filter === 'unread' ? 'secondary' : 'ghost'}
            className="h-7 text-xs px-3"
            onClick={() => setFilter('unread')}
            data-testid="filter-unread"
          >
            Unread
          </Button>
        </div>
      </div>

      <div className={cn('flex-1 overflow-y-auto', isLoading && 'opacity-50')}>
        {isLoading && messages.length === 0 ? (
          <div className="flex flex-col gap-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1 px-4 py-3 border-b">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <p className="text-sm">No messages.</p>
          </div>
        ) : (
          <>
            {displayed.map((msg) => {
              const isActive = msg.messageId === activeMessageId;
              const isUnread = !isSent && !msg.isRead;
              const displayName = isSent
                ? extractDisplayName(msg.to ?? '')
                : extractDisplayName(msg.from ?? msg.sender ?? '');

              return (
                <button
                  key={msg.messageId}
                  type="button"
                  onClick={() => handleRowClick(msg)}
                  className={cn(
                    'w-full text-left flex flex-col gap-0.5 px-4 py-3 border-b cursor-pointer transition-colors',
                    isActive ? 'bg-accent' : 'hover:bg-accent/50',
                    isUnread && !isActive && 'bg-accent/20',
                  )}
                  data-testid={`message-row-${msg.messageId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isUnread && (
                        <Badge variant="default" className="h-2 w-2 shrink-0 rounded-full p-0" aria-label="Unread" />
                      )}
                      <span className={cn('text-sm truncate', isUnread ? 'font-semibold' : 'font-medium')}>
                        {displayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                      {msg.attachments && msg.attachments.length > 0 && (
                        <Paperclip className="h-3 w-3" />
                      )}
                      <span>{formatDate(msg.receivedAt)}</span>
                    </div>
                  </div>
                  <span className={cn('text-xs text-muted-foreground truncate', isUnread && 'text-foreground/80')}>
                    {msg.subject || '(no subject)'}
                  </span>
                </button>
              );
            })}
            {nextCursor && (
              <div className="flex justify-center py-3">
                <Button variant="ghost" size="sm" onClick={() => fetchMessages(nextCursor)} disabled={isLoading}>
                  {isLoading ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
