'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Paperclip, Send, Trash2, X } from 'lucide-react';
import { useCompose, type ComposeInitialData } from '@/components/compose-context';

interface Address {
  email: string;
  status: string;
}

interface UploadedAttachment {
  filename: string;
  s3Key: string;
  contentType: string;
  size: number;
}

function validateEmails(value: string): boolean {
  if (!value.trim()) return true;
  const emails = value.split(',').map((e) => e.trim()).filter(Boolean);
  return emails.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

const composeSchema = z.object({
  from: z.string().min(1, 'From is required'),
  to: z
    .string()
    .min(1, 'To is required')
    .refine(validateEmails, 'Enter valid email addresses (comma-separated)'),
  cc: z
    .string()
    .refine(validateEmails, 'Enter valid email addresses (comma-separated)')
    .optional()
    .or(z.literal('')),
  bcc: z
    .string()
    .refine(validateEmails, 'Enter valid email addresses (comma-separated)')
    .optional()
    .or(z.literal('')),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string(),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

type SaveStatus = 'idle' | 'saving' | 'saved';

interface ComposeSheetInnerProps {
  addresses: Address[];
  initialData: ComposeInitialData | null;
  onClose: () => void;
}

function ComposeSheetInner({ addresses, initialData, onClose }: ComposeSheetInnerProps) {
  const activeAddresses = addresses.filter((a) => a.status !== 'deleted');

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      from: initialData?.from ?? activeAddresses[0]?.email ?? '',
      to: initialData?.to ?? '',
      cc: initialData?.cc ?? '',
      bcc: initialData?.bcc ?? '',
      subject: initialData?.subject ?? '',
      body: initialData?.body ?? '',
    },
  });

  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [draftId, setDraftId] = useState<string | null>(initialData?.draftId ?? null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftIdRef = useRef<string | null>(draftId);

  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function saveDraft(payload: Record<string, unknown>, existingDraftId: string | null): Promise<string | null> {
    setSaveStatus('saving');
    try {
      if (existingDraftId) {
        await fetch(`/api/drafts/${existingDraftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSavedAt(new Date());
        setSaveStatus('saved');
        return existingDraftId;
      } else {
        const res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  function scheduleSave(payload: Record<string, unknown>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveDraft(payload, draftIdRef.current);
    }, 10_000);
  }

  function buildPayload(values: Partial<ComposeFormValues>) {
    const current = form.getValues();
    return {
      from: values.from ?? current.from,
      to: values.to ?? current.to,
      cc: (values.cc ?? current.cc) || undefined,
      bcc: (values.bcc ?? current.bcc) || undefined,
      subject: values.subject ?? current.subject,
      body: values.body ?? current.body,
      attachmentKeys: attachments.map((a) => a.s3Key),
    };
  }

  function handleFieldChange(field: keyof ComposeFormValues, value: string) {
    scheduleSave(buildPayload({ [field]: value }));
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

  async function handleSend(values: ComposeFormValues) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: values.from,
          to: values.to,
          cc: values.cc || undefined,
          bcc: values.bcc || undefined,
          subject: values.subject,
          body: values.body,
          attachmentKeys: attachments.map((a) => a.s3Key),
          draftId: draftIdRef.current ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setSendError(data.error ?? 'Failed to send email');
        return;
      }
      onClose();
    } catch {
      setSendError('Failed to send email. Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  async function handleDiscard() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (draftIdRef.current) {
      await fetch(`/api/drafts/${draftIdRef.current}`, { method: 'DELETE' }).catch(() => null);
    }
    onClose();
  }

  function formatSavedAt(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SheetHeader className="shrink-0 pb-4">
        <div className="flex items-center justify-between pr-8">
          <SheetTitle>New Message</SheetTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saveStatus === 'saving' && (
              <span data-testid="save-status-saving">Saving…</span>
            )}
            {saveStatus === 'saved' && savedAt && (
              <span data-testid="save-status-saved">
                Draft saved {formatSavedAt(savedAt)}
              </span>
            )}
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSend)}
            className="space-y-4"
            data-testid="compose-form"
          >
            <FormField
              control={form.control}
              name="from"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">From</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                      handleFieldChange('from', val);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="compose-from">
                        <SelectValue placeholder="Select sender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeAddresses.map((addr) => (
                        <SelectItem key={addr.email} value={addr.email}>
                          {addr.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">To</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="recipient@example.com"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange('to', e.target.value);
                      }}
                      data-testid="compose-to"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Cc</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="cc@example.com"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange('cc', e.target.value);
                      }}
                      data-testid="compose-cc"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bcc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Bcc</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="bcc@example.com"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange('bcc', e.target.value);
                      }}
                      data-testid="compose-bcc"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Subject</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Subject"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange('subject', e.target.value);
                      }}
                      data-testid="compose-subject"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Message</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Write your message…"
                      className="min-h-[200px] resize-y"
                      onChange={(e) => {
                        field.onChange(e);
                        handleFieldChange('body', e.target.value);
                      }}
                      data-testid="compose-body"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {attachments.length > 0 && (
              <ul className="space-y-1" data-testid="compose-attachment-list">
                {attachments.map((att) => (
                  <li
                    key={att.s3Key}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{att.filename}</span>
                    <Button
                      type="button"
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
              <p className="text-sm text-destructive" role="alert" data-testid="compose-send-error">
                {sendError}
              </p>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="compose-file-input"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-1"
                  data-testid="compose-attach-button"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {isUploading ? 'Uploading…' : 'Attach'}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleDiscard}
                  data-testid="compose-discard-button"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Discard
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSending}
                  className="gap-1"
                  data-testid="compose-send-button"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isSending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

interface ComposeSheetProps {
  addresses: Address[];
}

export function ComposeSheet({ addresses }: ComposeSheetProps) {
  const { isOpen, initialData, closeCompose } = useCompose();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) closeCompose(); }}>
      <SheetContent data-testid="compose-sheet">
        {isOpen && (
          <ComposeSheetInner
            addresses={addresses}
            initialData={initialData}
            onClose={closeCompose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}