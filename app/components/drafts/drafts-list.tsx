'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FileText } from 'lucide-react';
import { MailboxCard, formatMailboxDate } from '@/components/mailbox-card';
import { BulkActionToolbar } from '@/components/bulk-action-toolbar';
import { tryNavigate } from '@/lib/navigation-guard';

interface Draft {
  draftId: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
  attachmentKeys?: string[];
  inReplyToMessageId?: string;
  updatedAt: string;
}

interface DraftsListProps {
  drafts: Draft[];
  address: string;
}

export function DraftsList({ drafts: initialDrafts, address }: DraftsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeDraftId = (() => {
    const segments = pathname.split('/');
    return segments.length >= 4 ? segments[3] : null;
  })();

  useEffect(() => {
    setPendingDraftId(null);
  }, [pathname]);

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
    const removed = drafts.filter((d) => ids.includes(d.draftId));
    setDrafts((prev) => prev.filter((d) => !selectedIds.has(d.draftId)));
    setSelectedIds(new Set());

    if (activeDraftId && ids.includes(activeDraftId)) {
      router.push(`/drafts/${encodeURIComponent(address)}`);
    }

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      ),
    );

    const failed = removed.filter((_, i) => {
      const r = results[i];
      return r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok);
    });
    if (failed.length > 0) {
      setDrafts((prev) => {
        const existing = new Set(prev.map((d) => d.draftId));
        return [...failed.filter((d) => !existing.has(d.draftId)), ...prev];
      });
    }
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
        {drafts.length === 0 ? (
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
