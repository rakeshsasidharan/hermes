'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWs } from '@/components/ws-context';
import { MailboxCard, formatMailboxDate } from '@/components/mailbox-card';
import { BulkActionToolbar } from '@/components/bulk-action-toolbar';

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
  snippet?: string;
  attachments?: Attachment[];
}

interface MessageListProps {
  address: string;
  direction: 'inbound' | 'outbound';
  folder?: 'inbox' | 'junk' | 'trash';
  initialMessages: Message[];
  initialNextCursor: string | null;
  folderLabel: string;
}

type Filter = 'all' | 'unread';

export function MessageList({ address, direction, folder, initialMessages, initialNextCursor, folderLabel }: MessageListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { subscribe } = useWs();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [filter, setFilter] = useState<Filter>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isInboxFolder = folder === 'inbox' || (!folder && direction === 'inbound');

  const activeMessageId = (() => {
    const segments = pathname.split('/');
    return segments.length >= 4 ? segments[3] : null;
  })();

  useEffect(() => {
    setPendingMessageId(null);
  }, [pathname]);

  // Clear selection when navigating between folders
  useEffect(() => {
    setSelectedIds(new Set());
  }, [folder, direction]);

  useEffect(() => {
    if (!isInboxFolder) return;
    return subscribe((event) => {
      if (event.address.toLowerCase() !== address.toLowerCase()) return;
      fetch(`/api/messages/${encodeURIComponent(event.messageId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const incoming: Message = data?.message;
          if (!incoming) return;
          setMessages((prev) => {
            if (prev.some((m) => m.messageId === incoming.messageId)) return prev;
            return [incoming, ...prev];
          });
        })
        .catch(() => null);
    });
  }, [subscribe, address, isInboxFolder]);

  useEffect(() => {
    function onReadStatus(e: Event) {
      const { messageId, isRead } = (e as CustomEvent<{ messageId: string; isRead: boolean }>).detail;
      setMessages((prev) =>
        prev.map((m) => m.messageId === messageId ? { ...m, isRead } : m),
      );
    }
    window.addEventListener('hermes:readstatus', onReadStatus);
    return () => window.removeEventListener('hermes:readstatus', onReadStatus);
  }, []);

  useEffect(() => {
    function onMessageRemoved(e: Event) {
      const { messageId } = (e as CustomEvent<{ messageId: string }>).detail;
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
    }
    window.addEventListener('hermes:messageremoved', onMessageRemoved);
    return () => window.removeEventListener('hermes:messageremoved', onMessageRemoved);
  }, []);

  useEffect(() => {
    if (!isInboxFolder) return;
    const unreadCount = messages.filter((m) => !m.isRead).length;
    window.dispatchEvent(
      new CustomEvent('hermes:inboxcount', { detail: { address, unreadCount } }),
    );
  }, [messages, address, isInboxFolder]);

  const fetchMessages = useCallback(async (cursor?: string) => {
    setIsLoading(true);
    const params = new URLSearchParams({ address });
    if (folder) {
      params.set('folder', folder);
    } else {
      params.set('direction', direction);
    }
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
  }, [address, direction, folder]);

  function handleRowClick(msg: Message) {
    setPendingMessageId(msg.messageId);
    const root = folder ?? (direction === 'outbound' ? 'sent' : 'inbox');
    if (!isSent && !msg.isRead && (folder === 'inbox' || folder === 'junk' || !folder)) {
      setMessages((prev) =>
        prev.map((m) => m.messageId === msg.messageId ? { ...m, isRead: true } : m),
      );
    }
    router.push(`/${root}/${encodeURIComponent(address)}/${msg.messageId}`);
  }

  function handleSelectToggle(messageId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(displayed.map((m) => m.messageId)));
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  function navigateAwayIfNeeded(ids: string[]) {
    if (activeMessageId && ids.includes(activeMessageId)) {
      const root = folder ?? (direction === 'outbound' ? 'sent' : 'inbox');
      router.push(`/${root}/${encodeURIComponent(address)}`);
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const removed = messages.filter((m) => ids.includes(m.messageId));
    setMessages((prev) => prev.filter((m) => !selectedIds.has(m.messageId)));
    setSelectedIds(new Set());
    navigateAwayIfNeeded(ids);

    const results = await Promise.allSettled(
      ids.map((id) =>
        folder === 'trash'
          ? fetch(`/api/messages/${encodeURIComponent(id)}`, { method: 'DELETE' })
          : fetch(`/api/messages/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folder: 'trash' }),
            }),
      ),
    );

    const failed = removed.filter((_, i) => {
      const r = results[i];
      return r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok);
    });
    if (failed.length > 0) {
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.messageId));
        return [...failed.filter((m) => !existing.has(m.messageId)), ...prev];
      });
    }
    router.refresh();
  }

  async function handleBulkJunk() {
    const ids = [...selectedIds];
    const removed = messages.filter((m) => ids.includes(m.messageId));
    setMessages((prev) => prev.filter((m) => !selectedIds.has(m.messageId)));
    setSelectedIds(new Set());
    navigateAwayIfNeeded(ids);

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/messages/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: 'junk' }),
        }),
      ),
    );

    const failed = removed.filter((_, i) => {
      const r = results[i];
      return r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok);
    });
    if (failed.length > 0) {
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.messageId));
        return [...failed.filter((m) => !existing.has(m.messageId)), ...prev];
      });
    }
    router.refresh();
  }

  async function handleBulkMarkRead() {
    const ids = [...selectedIds];
    const original = messages.map((m) => ({ id: m.messageId, isRead: m.isRead }));
    setMessages((prev) =>
      prev.map((m) => selectedIds.has(m.messageId) ? { ...m, isRead: true } : m),
    );
    setSelectedIds(new Set());

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/messages/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        }),
      ),
    );

    const failedIds = new Set(
      ids.filter((_, i) => {
        const r = results[i];
        return r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok);
      }),
    );
    if (failedIds.size > 0) {
      setMessages((prev) =>
        prev.map((m) => {
          if (!failedIds.has(m.messageId)) return m;
          const orig = original.find((o) => o.id === m.messageId);
          return orig ? { ...m, isRead: orig.isRead } : m;
        }),
      );
    }
    router.refresh();
  }

  async function handleBulkMarkUnread() {
    const ids = [...selectedIds];
    const original = messages.map((m) => ({ id: m.messageId, isRead: m.isRead }));
    setMessages((prev) =>
      prev.map((m) => selectedIds.has(m.messageId) ? { ...m, isRead: false } : m),
    );
    setSelectedIds(new Set());

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/messages/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: false }),
        }),
      ),
    );

    const failedIds = new Set(
      ids.filter((_, i) => {
        const r = results[i];
        return r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok);
      }),
    );
    if (failedIds.size > 0) {
      setMessages((prev) =>
        prev.map((m) => {
          if (!failedIds.has(m.messageId)) return m;
          const orig = original.find((o) => o.id === m.messageId);
          return orig ? { ...m, isRead: orig.isRead } : m;
        }),
      );
    }
    router.refresh();
  }

  const isSent = direction === 'outbound';

  function extractDisplayName(emailStr: string): string {
    const match = emailStr.match(/^(.+?)\s*<[^>]+>$/);
    const name = match ? match[1].trim() : emailStr;
    return name.replace(/^"|"$/g, '');
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

      <BulkActionToolbar
        totalCount={displayed.length}
        selectedCount={selectedIds.size}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onDelete={handleBulkDelete}
        onJunk={folder === 'junk' ? undefined : handleBulkJunk}
        onMarkRead={isInboxFolder ? handleBulkMarkRead : undefined}
        onMarkUnread={isInboxFolder ? handleBulkMarkUnread : undefined}
      />

      <div className={`flex-1 overflow-y-auto${isLoading ? ' opacity-50' : ''}`}>
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
            <div className="flex flex-col gap-2 p-2">
              {displayed.map((msg) => {
                const isActive = msg.messageId === activeMessageId || msg.messageId === pendingMessageId;
                const isUnread = !isSent && !msg.isRead;
                const displayName = isSent
                  ? extractDisplayName(msg.to ?? '')
                  : extractDisplayName(msg.from ?? msg.sender ?? '');

                return (
                  <MailboxCard
                    key={msg.messageId}
                    testId={`message-row-${msg.messageId}`}
                    isActive={isActive}
                    isLoading={msg.messageId === pendingMessageId}
                    isUnread={isUnread}
                    isSelected={selectedIds.has(msg.messageId)}
                    displayName={displayName}
                    date={formatMailboxDate(msg.receivedAt)}
                    subject={msg.subject}
                    snippet={msg.snippet}
                    hasAttachments={(msg.attachments?.length ?? 0) > 0}
                    onClick={() => handleRowClick(msg)}
                    onSelectToggle={() => handleSelectToggle(msg.messageId)}
                  />
                );
              })}
            </div>
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
