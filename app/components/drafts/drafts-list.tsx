'use client';

import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { useCompose } from '@/components/compose-context';

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
  const { openCompose } = useCompose();

  function handleDraftClick(draft: Draft) {
    if (draft.inReplyToMessageId) {
      const address = encodeURIComponent(draft.from ?? '');
      const mode = 'reply';
      router.push(
        `/inbox/${address}/${encodeURIComponent(draft.inReplyToMessageId)}?draftId=${draft.draftId}&mode=${mode}`,
      );
    } else {
      openCompose({
        draftId: draft.draftId,
        from: draft.from,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
        attachmentKeys: draft.attachmentKeys,
      });
    }
  }

  if (drafts.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-20 text-center"
        data-testid="drafts-empty-state"
      >
        <FileText className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No drafts saved yet</p>
      </div>
    );
  }

  return (
    <div data-testid="drafts-list">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Last saved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drafts.map((draft) => (
            <TableRow
              key={draft.draftId}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => handleDraftClick(draft)}
              data-testid={`draft-row-${draft.draftId}`}
            >
              <TableCell>
                {draft.subject ? (
                  <span className="font-medium">{draft.subject}</span>
                ) : (
                  <span className="text-muted-foreground italic">No subject</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {draft.to ?? '—'}
              </TableCell>
              <TableCell>
                {draft.inReplyToMessageId ? (
                  <Badge variant="secondary" className="text-xs">Reply</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">New</Badge>
                )}
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {new Date(draft.updatedAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
