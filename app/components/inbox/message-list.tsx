'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWs } from '@/components/ws-context';
import { MailboxCard, formatMailboxDate } from '@/components/mailbox-card';
import { BulkActionToolbar } from '@/components/bulk-action-toolbar';
import {
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useMarkReadStatusMutation,
  useMoveMessageMutation,
  useDeleteMessageMutation,
  apiSlice,
  type Message,
} from '@/store/api';
import type { AppDispatch } from '@/store';

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
  const dispatch = useDispatch<AppDispatch>();
  const { subscribe } = useWs();

  const { data, isFetching } = useGetMessagesQuery({ address, folder, direction });
  const [triggerLoadMore, { isFetching: isLoadingMore }] = useLazyGetMessagesQuery();
  const [markReadStatus] = useMarkReadStatusMutation();
  const [moveMessage] = useMoveMessageMutation();
  const [deleteMessage] = useDeleteMessageMutation();

  const messages = data?.messages ?? initialMessages;
  const nextCursor = data?.nextCursor ?? initialNextCursor;
  const isLoading = (isFetching || isLoadingMore) && !data;

  const [filter, setFilter] = useState<Filter>('all');
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isInboxFolder = folder === 'inbox' || (!folder && direction === 'inbound');
  const isSent = direction === 'outbound';

  const activeMessageId = (() => {
    const segments = pathname.split('/');
    return segments.length >= 4 ? segments[3] : null;
  })();

  useEffect(() => {
    setPendingMessageId(null);
  }, [pathname]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [folder, direction]);

  // Prepend incoming WS messages directly into the RTK cache
  useEffect(() => {
    if (!isInboxFolder) return;
    return subscribe((event) => {
      if (event.address.toLowerCase() !== address.toLowerCase()) return;
      fetch(`/api/messages/${encodeURIComponent(event.messageId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((responseData) => {
          const incoming: Message = responseData?.message;
          if (!incoming) return;
          dispatch(
            apiSlice.util.updateQueryData(
              'getMessages',
              { address, folder, direction },
              (draft) => {
                if (draft.messages.some((m) => m.messageId === incoming.messageId)) return;
                draft.messages.unshift(incoming);
              },
            ),
          );
        })
        .catch(() => null);
    });
  }, [subscribe, address, isInboxFolder, dispatch, folder, direction]);

  function handleLoadMore() {
    if (nextCursor) {
      triggerLoadMore({ address, folder, direction, cursor: nextCursor });
    }
  }

  function handleRowClick(msg: Message) {
    setPendingMessageId(msg.messageId);
    const root = folder ?? (direction === 'outbound' ? 'sent' : 'inbox');
    if (!isSent && !msg.isRead && isInboxFolder) {
      dispatch(
        apiSlice.util.updateQueryData(
          'getMessages',
          { address, folder, direction },
          (draft) => {
            const m = draft.messages.find((m) => m.messageId === msg.messageId);
            if (m) m.isRead = true;
          },
        ),
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
    setSelectedIds(new Set());
    navigateAwayIfNeeded(ids);

    await Promise.allSettled(
      ids.map((id) =>
        folder === 'trash'
          ? deleteMessage({ messageId: id, address, folder, direction })
          : moveMessage({
              messageId: id,
              targetFolder: 'trash',
              fromAddress: address,
              fromFolder: folder,
              fromDirection: direction,
            }),
      ),
    );
  }

  async function handleBulkJunk() {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    navigateAwayIfNeeded(ids);

    await Promise.allSettled(
      ids.map((id) =>
        moveMessage({
          messageId: id,
          targetFolder: 'junk',
          fromAddress: address,
          fromFolder: folder,
          fromDirection: direction,
        }),
      ),
    );
  }

  async function handleBulkMarkRead() {
    const ids = [...selectedIds];
    setSelectedIds(new Set());

    await Promise.allSettled(
      ids.map((id) =>
        markReadStatus({ messageId: id, isRead: true, address, folder, direction }),
      ),
    );
  }

  async function handleBulkMarkUnread() {
    const ids = [...selectedIds];
    setSelectedIds(new Set());

    await Promise.allSettled(
      ids.map((id) =>
        markReadStatus({ messageId: id, isRead: false, address, folder, direction }),
      ),
    );
  }

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
                <Button variant="ghost" size="sm" onClick={handleLoadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
