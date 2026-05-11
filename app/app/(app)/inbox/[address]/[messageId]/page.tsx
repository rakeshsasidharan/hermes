import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { MessageDetail } from '@/components/messages/message-detail';

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
  from?: string;
  to?: string;
  cc?: string;
  bodyHtmlUrl?: string;
  bodyTextUrl?: string;
  attachments?: Attachment[];
}

async function getMessage(id: string): Promise<Message | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    redirect('/login');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/messages/${encodeURIComponent(id)}`, {
    headers: { Cookie: `access_token=${token}` },
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
  }

  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = await res.json();
  return data.message ?? null;
}

interface Props {
  params: Promise<{ address: string; messageId: string }>;
  searchParams: Promise<{ draftId?: string; mode?: string }>;
}

export default async function MessageDetailPage({ params, searchParams }: Props) {
  const { messageId } = await params;
  const { draftId, mode } = await searchParams;
  const message = await getMessage(messageId);

  if (!message) {
    notFound();
  }

  return (
    <MessageDetail
      message={message}
      initialDraftId={draftId}
      initialComposerMode={mode === 'replyAll' ? 'replyAll' : mode === 'reply' ? 'reply' : undefined}
    />
  );
}
