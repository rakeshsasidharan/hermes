'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BookMarked, Paperclip, Send, Trash2, X } from 'lucide-react';

interface Message {
  messageId: string;
  subject: string;
  from?: string;
  to?: string;
  cc?: string;
}

interface UploadedAttachment {
  filename: string;
  s3Key: string;
  contentType: string;
  size: number;
}

interface ReplyComposerProps {
  message: Message;
  mode: 'reply' | 'replyAll' | 'forward';
  isSent?: boolean;
  currentAddress: string;
  quotedBody?: string | null;
  initialDraftId?: string | null;
  initialBody?: string;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

function buildCcForReplyAll(message: Message, currentAddress: string, isSent: boolean): string {
  const sources = isSent ? [message.cc] : [message.to, message.cc];
  const addresses = sources
    .filter(Boolean)
    .join(', ')
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a && a.toLowerCase() !== currentAddress.toLowerCase());
  return addresses.join(', ');
}

export function ReplyComposer({
  message,
  mode,
  isSent = false,
  currentAddress,
  quotedBody,
  initialDraftId = null,
  initialBody,
  onClose,
}: ReplyComposerProps) {
  const router = useRouter();
  const originalSubject = message.subject ?? '';

  const defaultSubject = (() => {
    if (mode === 'forward') {
      return originalSubject.toLowerCase().startsWith('fwd:')
        ? originalSubject
        : `Fwd: ${originalSubject}`;
    }
    return originalSubject.toLowerCase().startsWith('re:')
      ? originalSubject
      : `Re: ${originalSubject}`;
  })();

  const defaultTo = (() => {
    if (mode === 'forward') return '';
    return isSent ? (message.to ?? '') : (message.from ?? '');
  })();

  const defaultCc = mode === 'replyAll'
    ? buildCcForReplyAll(message, currentAddress, isSent)
    : '';

  const defaultBody = initialBody ?? (quotedBody
    ? `\n\n--- ${mode === 'forward' ? 'Forwarded Message' : 'Original Message'} ---\n${quotedBody}`
    : '');

  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState(defaultCc);
  const [body, setBody] = useState(defaultBody);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const modeLabel = mode === 'forward' ? 'Forward' : mode === 'replyAll' ? 'Reply All' : 'Reply';

  async function saveDraft(draftPayload: Record<string, unknown>, existingDraftId: string | null): Promise<string | null> {
    setSaveStatus('saving');
    try {
      if (existingDraftId) {
        await fetch(`/api/drafts/${existingDraftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftPayload),
        });
        setSavedAt(new Date());
        setSaveStatus('saved');
        return existingDraftId;
      } else {
        const res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftPayload),
        });
        if (!res.ok) {
          setSaveStatus('idle');
          return null;
        }
        const data = await res.json() as { draftId: string };
        setDraftId(data.draftId);
        setSavedAt(new Date());
        setSaveStatus('saved');
        return data.draftId;
      }
    } catch {
      setSaveStatus('idle');
      return existingDraftId;
    }
  }

  function buildPayload() {
    return {
      from: currentAddress,
      to,
      cc: cc || undefined,
      body,
      subject: defaultSubject,
      attachmentKeys: attachments.map((a) => a.s3Key),
      ...(mode !== 'forward' && { inReplyToMessageId: message.messageId }),
    };
  }

  async function handleSaveDraft() {
    await saveDraft(buildPayload(), draftId);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      if (!res.ok) return;
      const data = await res.json() as { s3Key: string; filename: string; contentType: string; size: number };
      setAttachments((prev) => [...prev, { filename: data.filename, s3Key: data.s3Key, contentType: data.contentType, size: data.size }]);
    } finally {
      setIsUploading(false);
    }
  }

  function removeAttachment(s3Key: string) {
    setAttachments((prev) => prev.filter((a) => a.s3Key !== s3Key));
  }

  async function handleSend() {
    setIsSending(true);
    setSendError(null);
    try {
      const endpoint = mode === 'forward'
        ? '/api/messages'
        : `/api/messages/${message.messageId}/reply`;
      const method = 'POST';
      const bodyPayload = mode === 'forward'
        ? {
            from: currentAddress,
            to,
            cc: cc || undefined,
            subject: defaultSubject,
            body,
            attachmentKeys: attachments.map((a) => a.s3Key),
            draftId: draftId ?? undefined,
          }
        : {
            from: currentAddress,
            to,
            cc: cc || undefined,
            body,
            attachmentKeys: attachments.map((a) => a.s3Key),
            draftId: draftId ?? undefined,
          };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setSendError(data.error ?? 'Failed to send');
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setSendError('Failed to send. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  async function handleDiscard() {
    if (draftId) {
      await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }).catch(() => null);
    }
    onClose();
    router.refresh();
  }

  function formatSavedAt(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <Card data-testid="reply-composer">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{modeLabel}</span>
            {saveStatus === 'saved' && savedAt && (
              <span className="text-xs text-muted-foreground" data-testid="save-status-saved">
                Draft saved {formatSavedAt(savedAt)}
              </span>
            )}
          </div>
          <Button size="icon" variant="ghost" onClick={handleDiscard} aria-label="Discard">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="reply-from" className="text-xs text-muted-foreground">From</Label>
          <Input
            id="reply-from"
            value={currentAddress}
            readOnly
            disabled
            className="bg-muted"
            data-testid="reply-from"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="reply-to" className="text-xs">To</Label>
          <Input
            id="reply-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            data-testid="reply-to"
          />
        </div>

        {(mode === 'replyAll' || mode === 'forward') && (
          <div className="space-y-1">
            <Label htmlFor="reply-cc" className="text-xs">Cc</Label>
            <Input
              id="reply-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              data-testid="reply-cc"
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="reply-body" className="text-xs">Message</Label>
          <Textarea
            id="reply-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={mode === 'forward' ? 'Add a message…' : 'Write your reply…'}
            className="min-h-40 resize-y"
            data-testid="reply-body"
          />
        </div>

        {attachments.length > 0 && (
          <ul className="space-y-1" data-testid="attachment-list">
            {attachments.map((att) => (
              <li key={att.s3Key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                <span className="truncate">{att.filename}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={() => removeAttachment(att.s3Key)}
                  aria-label={`Remove ${att.filename}`}
                  data-testid={`remove-attachment-${att.filename}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {sendError && (
          <p className="text-sm text-destructive" role="alert" data-testid="send-error">{sendError}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              data-testid="file-input"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="gap-1"
              data-testid="attach-button"
            >
              <Paperclip className="h-3.5 w-3.5" />
              {isUploading ? 'Uploading…' : 'Attach'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={saveStatus === 'saving'}
              className="gap-1"
              data-testid="save-draft-button"
            >
              <BookMarked className="h-3.5 w-3.5" />
              {saveStatus === 'saving' ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDiscard}
              data-testid="discard-button"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={isSending || !to.trim()}
              className="gap-1"
              data-testid="send-button"
            >
              <Send className="h-3.5 w-3.5" />
              {isSending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
