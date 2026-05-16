'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Paperclip } from 'lucide-react';
import { FilterBar, type Filters } from './filter-bar';
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
}

const EMPTY_FILTERS: Filters = { sender: '', subject: '', from: '', to: '' };

export function MessageList({ address, direction, initialMessages, initialNextCursor }: MessageListProps) {
  const router = useRouter();
  const { subscribe } = useWs();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [isLoading, setIsLoading] = useState(false);

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

  const fetchMessages = useCallback(async (cursor?: string, activeFilters?: Filters) => {
    setIsLoading(true);
    const active = activeFilters ?? filters;
    const params = new URLSearchParams({ address, direction });
    if (active.sender) params.set('sender', active.sender);
    if (active.subject) params.set('subject', active.subject);
    if (active.from) params.set('from', active.from);
    if (active.to) params.set('to', active.to);
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
  }, [address, direction, filters]);

  const handleFilter = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
    fetchMessages(undefined, newFilters);
  }, [fetchMessages]);

  function handleLoadMore() {
    if (nextCursor) fetchMessages(nextCursor);
  }

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

  return (
    <div className="space-y-4">
      <FilterBar onFilter={handleFilter} />

      <Table className={isLoading ? 'opacity-50 pointer-events-none' : ''}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>{isSent ? 'To' : 'From'}</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && messages.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
              </TableRow>
            ))
          ) : messages.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No messages yet.
              </TableCell>
            </TableRow>
          ) : (
            messages.map((msg) => (
              <TableRow
                key={msg.messageId}
                className={cn(
                  'cursor-pointer hover:bg-accent',
                  !isSent && !msg.isRead && 'bg-accent/30 font-medium',
                )}
                onClick={() => handleRowClick(msg)}
              >
                <TableCell className="py-2">
                  {msg.attachments && msg.attachments.length > 0 && (
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has attachments" />
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-2">
                    {!isSent && !msg.isRead && (
                      <Badge variant="default" className="h-4 w-4 shrink-0 rounded-full p-0" aria-label="Unread" />
                    )}
                    <span className={isSent ? 'truncate max-w-xs' : 'truncate max-w-48'}>
                      {isSent
                        ? extractDisplayName(msg.to ?? '')
                        : extractDisplayName(msg.from ?? msg.sender ?? '')}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-2 truncate max-w-xs">{msg.subject}</TableCell>
                <TableCell className="py-2 text-right text-muted-foreground text-sm whitespace-nowrap">
                  {new Date(msg.receivedAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
