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
  sender?: string;
  from?: string;
  to?: string;
  cc?: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
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

async function fetchBodyFromS3(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    return res.ok ? res.text() : null;
  } catch {
    return null;
  }
}

interface Props {
  params: Promise<{ address: string; messageId: string }>;
}

export default async function TrashMessageDetailPage({ params }: Props) {
  const { messageId } = await params;
  const message = await getMessage(messageId);

  if (!message) {
    notFound();
  }

  const htmlBody = message.bodyHtmlUrl ? await fetchBodyFromS3(message.bodyHtmlUrl) : null;
  const textBody = !htmlBody && message.bodyTextUrl ? await fetchBodyFromS3(message.bodyTextUrl) : null;

  return (
    <MessageDetail
      message={message}
      initialHtmlBody={htmlBody}
      initialTextBody={textBody}
    />
  );
}
