'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setNavigationGuard } from '@/lib/navigation-guard';
import { useSendEmailMutation, apiSlice } from '@/store/api';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BookMarked, Send, Trash2 } from 'lucide-react';

interface Draft {
  draftId: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
}

interface ComposeEditorProps {
  draft: Draft;
  address: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ComposeEditor({ draft, address }: ComposeEditorProps) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const [sendEmail] = useSendEmailMutation();

  const [to, setTo] = useState(draft.to ?? '');
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [body, setBody] = useState(draft.body ?? '');

  const [savedTo, setSavedTo] = useState(draft.to ?? '');
  const [savedSubject, setSavedSubject] = useState(draft.subject ?? '');
  const [savedBody, setSavedBody] = useState(draft.body ?? '');

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toError, setToError] = useState<string | null>(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const isDirty = to !== savedTo || subject !== savedSubject || body !== savedBody;
  const hasContent = to.trim() !== '' || subject.trim() !== '' || body.trim() !== '';

  // Stores the pushState call that was intercepted so we can release it after the dialog.
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!(isDirty && hasContent)) return;
    setNavigationGuard((proceed) => {
      pendingNavigationRef.current = proceed;
      setShowDiscardDialog(true);
    });
    return () => {
      setNavigationGuard(null);
    };
  }, [isDirty, hasContent]);

  // Drafts with no content were just created by the compose button and should be
  // deleted automatically if the user navigates away without saving.
  const hasPreexistingContent = !!(draft.to || draft.subject || draft.body);
  const shouldDeleteOnNavigateRef = useRef(!hasPreexistingContent);

  // Delete the draft on unmount if the user never explicitly saved or discarded it.
  useEffect(() => {
    const draftId = draft.draftId;
    return () => {
      if (shouldDeleteOnNavigateRef.current) {
        fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }).catch(() => null);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  async function handleSaveDraft() {
    setSaveStatus('saving');
    try {
      await fetch(`/api/drafts/${draft.draftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: draft.from, to, subject, body }),
      });
      setSavedTo(to);
      setSavedSubject(subject);
      setSavedBody(body);
      setSavedAt(new Date());
      setSaveStatus('saved');
      shouldDeleteOnNavigateRef.current = false;
    } catch {
      setSaveStatus('idle');
    }
  }

  async function handleSend() {
    if (!to.trim()) {
      setToError('To is required');
      return;
    }
    if (!validateEmail(to)) {
      setToError('Enter a valid email address');
      return;
    }
    setToError(null);
    setIsSending(true);
    setSendError(null);
    try {
      await sendEmail({
        from: draft.from ?? '',
        to,
        subject,
        body,
        draftId: draft.draftId,
      }).unwrap();
      shouldDeleteOnNavigateRef.current = false;
      // Navigate and remove draft from list in the same synchronous tick so
      // the compose editor closes at the same time the draft disappears.
      router.push(`/drafts/${encodeURIComponent(address)}`);
      if (draft.draftId) {
        dispatch(
          apiSlice.util.updateQueryData('getDrafts', address, (d) => {
            d.drafts = d.drafts.filter((x) => x.draftId !== draft.draftId);
          }),
        );
      }
    } catch (err) {
      const message = (err as { data?: { error?: string } })?.data?.error;
      setSendError(message ?? 'Failed to send email. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  async function doDiscard() {
    shouldDeleteOnNavigateRef.current = false;
    await fetch(`/api/drafts/${draft.draftId}`, { method: 'DELETE' }).catch(() => null);
    dispatch(apiSlice.util.invalidateTags(['Draft']));
    const pendingNav = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (pendingNav) {
      pendingNav();
    } else {
      router.push(`/drafts/${encodeURIComponent(address)}`);
    }
  }

  function handleDiscard() {
    if (isDirty && hasContent) {
      setShowDiscardDialog(true);
    } else {
      doDiscard();
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b px-4 h-14 shrink-0 gap-2">
        <span className="text-sm font-semibold truncate">
          {subject.trim() || 'New Message'}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {saveStatus === 'saved' && savedAt && (
            <span className="text-xs text-muted-foreground" data-testid="save-status-saved">
              Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={saveStatus === 'saving'}
            className="gap-1"
            data-testid="compose-save-draft-button"
          >
            <BookMarked className="h-3.5 w-3.5" />
            {saveStatus === 'saving' ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDiscard}
            className="gap-1"
            data-testid="compose-discard-button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={isSending}
            className="gap-1"
            data-testid="compose-send-button"
          >
            <Send className="h-3.5 w-3.5" />
            {isSending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4" data-testid="compose-form">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">From:</span>{' '}
            {draft.from ?? '—'}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="compose-to-input">To</label>
            <Input
              id="compose-to-input"
              value={to}
              onChange={(e) => { setTo(e.target.value); setToError(null); }}
              placeholder="recipient@example.com"
              data-testid="compose-to"
            />
            {toError && (
              <p className="text-xs text-destructive" role="alert" data-testid="compose-to-error">
                {toError}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="compose-subject-input">Subject</label>
            <Input
              id="compose-subject-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              data-testid="compose-subject"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="compose-body-input">Message</label>
            <Textarea
              id="compose-body-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              className="min-h-50 resize-y"
              data-testid="compose-body"
            />
          </div>

          {sendError && (
            <p className="text-sm text-destructive" role="alert" data-testid="compose-send-error">
              {sendError}
            </p>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Save or discard this draft?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="discard-dialog-cancel"
              onClick={() => { pendingNavigationRef.current = null; setShowDiscardDialog(false); }}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={async () => {
                setShowDiscardDialog(false);
                await handleSaveDraft();
                const pendingNav = pendingNavigationRef.current;
                pendingNavigationRef.current = null;
                if (pendingNav) pendingNav();
              }}
              data-testid="discard-dialog-save"
            >
              Save Draft
            </Button>
            <AlertDialogAction
              onClick={() => { setShowDiscardDialog(false); doDiscard(); }}
              data-testid="discard-dialog-confirm"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
