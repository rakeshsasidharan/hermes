'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FileText, Loader2 } from 'lucide-react';
import { MailboxCard, formatMailboxDate } from '@/components/mailbox-card';
import { BulkActionToolbar } from '@/components/bulk-action-toolbar';
import { tryNavigate } from '@/lib/navigation-guard';
import { useGetDraftsQuery, apiSlice, type Draft } from '@/store/api';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store';

interface DraftsListProps {
  address: string;
}

export function DraftsList({ address }: DraftsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch<AppDispatch>();
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useGetDraftsQuery(address);
  const drafts = data?.drafts ?? [];

  const activeDraftId = (() => {
    const segments = pathname.split('/');
    return segments.length >= 4 ? segments[3] : null;
  })();

  function handleDraftClick(draft: Draft) {
    if (draft.inReplyToMessageId) {
      const encodedAddress = encodeURIComponent(draft.from ?? '');
      const inReplyTo = draft.inReplyToMessageId;
      tryNavigate(() => {
        setPendingDraftId(draft.draftId);
        router.push(`/inbox/${encodedAddress}/${encodeURIComponent(inReplyTo)}?draftId=${draft.draftId}&mode=reply`);
      });
    } else {
      tryNavigate(() => {
        setPendingDraftId(draft.draftId);
        router.push(`/drafts/${encodeURIComponent(draft.from ?? '')}/${draft.draftId}`);
      });
    }
  }

  function handleSelectToggle(draftId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) {
        next.delete(draftId);
      } else {
        next.add(draftId);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(drafts.map((d) => d.draftId)));
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const draftsToRemove = drafts.filter((d) => ids.includes(d.draftId));

    const patchResult = dispatch(
      apiSlice.util.updateQueryData('getDrafts', address, (draft) => {
        draft.drafts = draft.drafts.filter((d) => !ids.includes(d.draftId));
      }),
    );
    setSelectedIds(new Set());

    if (activeDraftId && ids.includes(activeDraftId)) {
      router.push(`/drafts/${encodeURIComponent(address)}`);
    }

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      ),
    );

    const failed = draftsToRemove.filter((_, i) => {
      const r = results[i];
      return r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok);
    });

    if (failed.length > 0) {
      patchResult.undo();
      const succeededIds = new Set(
        ids.filter((_, i) => {
          const r = results[i];
          return r.status === 'fulfilled' && r.value.ok;
        }),
      );
      if (succeededIds.size > 0) {
        dispatch(
          apiSlice.util.updateQueryData('getDrafts', address, (draft) => {
            draft.drafts = draft.drafts.filter((d) => !succeededIds.has(d.draftId));
          }),
        );
      }
    }

    dispatch(apiSlice.util.invalidateTags(['Draft']));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-4 h-14 shrink-0">
        <h2 className="font-semibold text-sm">Drafts</h2>
      </div>

      <BulkActionToolbar
        totalCount={drafts.length}
        selectedCount={selectedIds.size}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onDelete={handleBulkDelete}
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 h-full" data-testid="drafts-loading">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : drafts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-20 text-center h-full"
            data-testid="drafts-empty-state"
          >
            <FileText className="h-12 w-12 text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">No drafts saved yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-2" data-testid="drafts-list">
            {drafts.map((draft) => (
              <MailboxCard
                key={draft.draftId}
                testId={`draft-row-${draft.draftId}`}
                isActive={draft.draftId === activeDraftId || draft.draftId === pendingDraftId}
                isLoading={draft.draftId === pendingDraftId}
                isSelected={selectedIds.has(draft.draftId)}
                displayName={draft.to?.trim() || 'No recipient'}
                date={formatMailboxDate(draft.updatedAt)}
                subject={draft.subject?.trim() || '(no subject)'}
                onClick={() => handleDraftClick(draft)}
                onSelectToggle={() => handleSelectToggle(draft.draftId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
