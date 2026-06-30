'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArchiveX,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  MailOpen,
  Download,
  Inbox,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ReplyComposer } from '@/components/messages/reply-composer';
import {
  useMarkReadStatusMutation,
  useMoveMessageMutation,
  useDeleteMessageMutation,
} from '@/store/api';

interface Attachment {
  filename: string;
  url: string;
  contentType?: string;
  size?: number;
}

interface Message {
  messageId: string;
  sender?: string;
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
  initialHtmlBody?: string | null;
  initialTextBody?: string | null;
  initialDraftId?: string;
  initialComposerMode?: 'reply' | 'replyAll';
}

type ComposerMode = 'reply' | 'replyAll' | 'forward' | null;

export function MessageDetail({ message, initialHtmlBody, initialTextBody, initialDraftId, initialComposerMode }: MessageDetailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const folder = pathname.split('/')[1]; // 'inbox' | 'sent' | 'drafts' | 'junk' | 'trash'
  const isSent = folder === 'sent';
  const showReadToggle = folder === 'inbox' || folder === 'junk';
  const listHref = pathname.split('/').slice(0, 3).join('/');

  // Derive the cache context from the current route
  const fromFolder = (folder === 'inbox' || folder === 'junk' || folder === 'trash')
    ? (folder as 'inbox' | 'junk' | 'trash')
    : undefined;
  const fromDirection = (!fromFolder && !isSent) ? 'inbound' : (isSent ? 'outbound' : undefined);
  const fromAddress = message.address ?? (isSent ? message.from : message.to) ?? '';

  const [markReadStatus] = useMarkReadStatusMutation();
  const [moveMessage] = useMoveMessageMutation();
  const [deleteMsg] = useDeleteMessageMutation();

  const [htmlBody] = useState<string | null>(initialHtmlBody ?? null);
  const [textBody] = useState<string | null>(initialTextBody ?? null);
  const [iframeHeight, setIframeHeight] = useState(400);
  const [isRead, setIsRead] = useState(message.isRead);
  const [composerMode, setComposerMode] = useState<ComposerMode>(initialComposerMode ?? null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isMovingToJunk, setIsMovingToJunk] = useState(false);
  const [isTogglingRead, setIsTogglingRead] = useState(false);

  // Auto-mark as read when opening an unread message in inbox or junk
  useEffect(() => {
    if (!showReadToggle || message.isRead) return;
    setIsRead(true);
    markReadStatus({
      messageId: message.messageId,
      isRead: true,
      address: fromAddress,
      folder: fromFolder,
      direction: fromDirection,
    });
  }, [message.messageId, message.isRead, showReadToggle]);

  async function toggleRead() {
    const next = !isRead;
    setIsRead(next);
    setIsTogglingRead(true);
    try {
      await markReadStatus({
        messageId: message.messageId,
        isRead: next,
        address: fromAddress,
        folder: fromFolder,
        direction: fromDirection,
      });
    } catch {
      setIsRead(!next);
    } finally {
      setIsTogglingRead(false);
    }
  }

  async function handleMoveToTrash() {
    setIsDeleting(true);
    try {
      const result = await moveMessage({
        messageId: message.messageId,
        targetFolder: 'trash',
        fromAddress,
        fromFolder,
        fromDirection,
      });
      if ('error' in result) {
        toast.error('Failed to move message to Trash');
        return;
      }
      toast.success('Moved to Trash');
      router.push(listHref);
    } catch {
      toast.error('Failed to move message to Trash');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await deleteMsg({
        messageId: message.messageId,
        address: fromAddress,
        folder: fromFolder,
        direction: fromDirection,
      });
      if ('error' in result) {
        toast.error('Failed to delete message');
        return;
      }
      router.push(listHref);
    } catch {
      toast.error('Failed to delete message');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRestoreToInbox() {
    setIsRestoring(true);
    try {
      const result = await moveMessage({
        messageId: message.messageId,
        targetFolder: 'inbox',
        fromAddress,
        fromFolder,
        fromDirection,
      });
      if ('error' in result) {
        toast.error('Failed to restore message');
        return;
      }
      toast.success('Moved to Inbox');
      router.push(listHref);
    } catch {
      toast.error('Failed to restore message');
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleMoveToJunk() {
    setIsMovingToJunk(true);
    try {
      const result = await moveMessage({
        messageId: message.messageId,
        targetFolder: 'junk',
        fromAddress,
        fromFolder,
        fromDirection,
      });
      if ('error' in result) {
        toast.error('Failed to move message to Junk');
        return;
      }
      toast.success('Moved to Junk');
      router.push(listHref);
    } catch {
      toast.error('Failed to move message to Junk');
    } finally {
      setIsMovingToJunk(false);
    }
  }

  const currentAddress = message.address ?? (isSent ? message.from : message.to) ?? '';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b px-4 h-14 shrink-0 gap-2">
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <span className="text-sm font-semibold truncate">{message.subject}</span>
          <span className="text-xs text-muted-foreground truncate">
            {message.from ?? message.sender} · {new Date(message.receivedAt).toLocaleString()}
          </span>
        </div>

        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1 shrink-0">
            {(folder === 'junk' || folder === 'trash') ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleRestoreToInbox}
                    disabled={isRestoring}
                    aria-label="Restore to Inbox"
                  >
                    {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restore to Inbox</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleMoveToJunk}
                    disabled={isMovingToJunk}
                    aria-label="Move to Junk"
                  >
                    {isMovingToJunk ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveX className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move to Junk</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={folder === 'inbox' ? handleMoveToTrash : handleDelete}
                  disabled={isDeleting}
                  aria-label={folder === 'inbox' ? 'Move to Trash' : 'Delete'}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{folder === 'inbox' ? 'Move to Trash' : 'Delete'}</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-5 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={composerMode === 'reply' ? 'secondary' : 'ghost'}
                  className="h-8 w-8"
                  onClick={() => setComposerMode(composerMode === 'reply' ? null : 'reply')}
                  aria-label="Reply"
                >
                  <Reply className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reply</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={composerMode === 'replyAll' ? 'secondary' : 'ghost'}
                  className="h-8 w-8"
                  onClick={() => setComposerMode(composerMode === 'replyAll' ? null : 'replyAll')}
                  aria-label="Reply All"
                >
                  <ReplyAll className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reply All</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={composerMode === 'forward' ? 'secondary' : 'ghost'}
                  className="h-8 w-8"
                  onClick={() => setComposerMode(composerMode === 'forward' ? null : 'forward')}
                  aria-label="Forward"
                >
                  <Forward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>

            {showReadToggle && (
              <>
                <Separator orientation="vertical" className="h-5 mx-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={toggleRead}
                      disabled={isTogglingRead}
                      aria-label={isRead ? 'Mark as Unread' : 'Mark as Read'}
                    >
                      {isTogglingRead ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailOpen className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isRead ? 'Mark as Unread' : 'Mark as Read'}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </TooltipProvider>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          <div className="text-xs text-muted-foreground space-y-0.5">
            {message.from && <p><span className="font-medium text-foreground">From:</span> {message.from}</p>}
            {message.to && <p><span className="font-medium text-foreground">To:</span> {message.to}</p>}
            {message.cc && <p><span className="font-medium text-foreground">Cc:</span> {message.cc}</p>}
          </div>

          {composerMode ? (
            <ReplyComposer
              message={message}
              mode={composerMode}
              isSent={isSent}
              currentAddress={currentAddress}
              quotedBody={textBody}
              quotedHtml={htmlBody}
              initialDraftId={initialDraftId}
              onClose={() => setComposerMode(null)}
            />
          ) : (
            <>
              <div>
                {htmlBody ? (
                  <iframe
                    srcDoc={htmlBody}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ height: iframeHeight }}
                    title="Email body"
                    data-testid="html-body-frame"
                    onLoad={(e) => {
                      const doc = e.currentTarget.contentDocument?.documentElement;
                      if (doc) setIframeHeight(doc.scrollHeight);
                    }}
                  />
                ) : textBody ? (
                  <pre className="whitespace-pre-wrap text-sm font-sans" data-testid="text-body">
                    {textBody}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">No message body.</p>
                )}
              </div>

              {message.attachments && message.attachments.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    Attachments ({message.attachments.length})
                  </h3>
                  <ul className="space-y-2">
                    {message.attachments.map((att, i) => (
                      <li key={att.filename ?? i} className="flex items-center justify-between gap-2">
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
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
