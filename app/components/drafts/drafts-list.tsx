'use client';

import { useRouter, usePathname } from 'next/navigation';
import { FileText } from 'lucide-react';
import { MailboxCard, formatMailboxDate } from '@/components/mailbox-card';
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
}

export function DraftsList({ drafts }: DraftsListProps) {
  const router = useRouter();
  const pathname = usePathname();

  const activeDraftId = (() => {
    const segments = pathname.split('/');
    return segments.length >= 4 ? segments[3] : null;
  })();

  function handleDraftClick(draft: Draft) {
    if (draft.inReplyToMessageId) {
      const address = encodeURIComponent(draft.from ?? '');
      const inReplyTo = draft.inReplyToMessageId;
      tryNavigate(() => router.push(
        `/inbox/${address}/${encodeURIComponent(inReplyTo)}?draftId=${draft.draftId}&mode=reply`,
      ));
    } else {
      tryNavigate(() => router.push(`/drafts/${encodeURIComponent(draft.from ?? '')}/${draft.draftId}`));
    }
  }

  if (drafts.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-20 text-center h-full"
        data-testid="drafts-empty-state"
      >
        <FileText className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No drafts saved yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2" data-testid="drafts-list">
      {drafts.map((draft) => (
        <MailboxCard
          key={draft.draftId}
          testId={`draft-row-${draft.draftId}`}
          isActive={draft.draftId === activeDraftId}
          displayName={draft.to?.trim() || 'No recipient'}
          date={formatMailboxDate(draft.updatedAt)}
          subject={draft.subject?.trim() || '(no subject)'}
          onClick={() => handleDraftClick(draft)}
        />
      ))}
    </div>
  );
}
