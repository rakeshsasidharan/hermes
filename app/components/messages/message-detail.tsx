'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Reply, ReplyAll, MailOpen } from 'lucide-react';
import { ReplyComposer } from '@/components/messages/reply-composer';

interface Attachment {
  filename: string;
  url: string;
  contentType?: string;
  size?: number;
}

interface Message {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
  address?: string;
  from?: string;
  to?: string;
  cc?: string;
  bodyHtmlUrl?: string;
  bodyTextUrl?: string;
  attachments?: Attachment[];
}

interface MessageDetailProps {
  message: Message;
  initialDraftId?: string;
  initialComposerMode?: 'reply' | 'replyAll';
}

export function MessageDetail({ message, initialDraftId, initialComposerMode }: MessageDetailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [htmlBody, setHtmlBody] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [isRead, setIsRead] = useState(message.isRead);
  const [composerMode, setComposerMode] = useState<'reply' | 'replyAll' | null>(initialComposerMode ?? null);

  useEffect(() => {
    if (message.bodyHtmlUrl) {
      fetch(message.bodyHtmlUrl).then((r) => r.text()).then(setHtmlBody).catch(() => null);
    }
    if (!message.bodyHtmlUrl && message.bodyTextUrl) {
      fetch(message.bodyTextUrl).then((r) => r.text()).then(setTextBody).catch(() => null);
    }
  }, [message.bodyHtmlUrl, message.bodyTextUrl]);

  useEffect(() => {
    if (!message.isRead) {
      fetch(`/api/messages/${message.messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      }).then((r) => {
        if (r.ok) setIsRead(true);
      }).catch(() => null);
    }
  }, [message.messageId, message.isRead]);

  useEffect(() => {
    if (htmlBody && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlBody);
        doc.close();
      }
    }
  }, [htmlBody]);

  async function toggleRead() {
    const next = !isRead;
    setIsRead(next);
    try {
      await fetch(`/api/messages/${message.messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: next }),
      });
    } catch {
      setIsRead(!next);
    }
  }

  function handleReply() {
    setComposerMode('reply');
  }

  function handleReplyAll() {
    setComposerMode('replyAll');
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{message.subject}</h2>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p><span className="font-medium text-foreground">From:</span> {message.from ?? message.sender}</p>
                {message.to && <p><span className="font-medium text-foreground">To:</span> {message.to}</p>}
                {message.cc && <p><span className="font-medium text-foreground">Cc:</span> {message.cc}</p>}
                <p><span className="font-medium text-foreground">Date:</span> {new Date(message.receivedAt).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {!isRead && <Badge variant="default">Unread</Badge>}
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={handleReply} className="gap-1">
                  <Reply className="h-3.5 w-3.5" />
                  Reply
                </Button>
                <Button size="sm" variant="outline" onClick={handleReplyAll} className="gap-1">
                  <ReplyAll className="h-3.5 w-3.5" />
                  Reply All
                </Button>
                <Button size="sm" variant="ghost" onClick={toggleRead} className="gap-1">
                  <MailOpen className="h-3.5 w-3.5" />
                  Mark as {isRead ? 'Unread' : 'Read'}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-4">
          <ScrollArea className="h-125 w-full rounded-md">
            {htmlBody ? (
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin"
                className="w-full min-h-120 border-0"
                title="Email body"
                data-testid="html-body-frame"
              />
            ) : textBody ? (
              <pre className="whitespace-pre-wrap text-sm font-sans p-1" data-testid="text-body">
                {textBody}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground p-1">No message body.</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {message.attachments && message.attachments.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-medium mb-3">
              Attachments ({message.attachments.length})
            </h3>
            <ul className="space-y-2">
              {message.attachments.map((att) => (
                <li key={att.filename} className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{att.filename}</span>
                  <Button asChild size="sm" variant="outline" className="gap-1 shrink-0">
                    <a href={att.url} download={att.filename} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {composerMode && (
        <ReplyComposer
          message={message}
          replyAll={composerMode === 'replyAll'}
          currentAddress={message.address ?? message.to ?? ''}
          quotedBody={textBody}
          initialDraftId={initialDraftId}
          onClose={() => setComposerMode(null)}
        />
      )}
    </div>
  );
}
