import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MessageList } from '@/components/inbox/message-list';

interface Message {
  messageId: string;
  address: string;
  sender?: string;
  from?: string;
  to?: string;
  direction?: 'inbound' | 'outbound';
  subject: string;
  receivedAt: string;
  isRead: boolean;
  attachments?: { filename: string; s3Key: string }[];
}

async function getMessages(address: string, direction: 'inbound' | 'outbound') {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    redirect('/login');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const params = new URLSearchParams({ address, direction });
  const res = await fetch(`${baseUrl}/api/messages?${params.toString()}`, {
    headers: { Cookie: `access_token=${token}` },
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
  }

  if (!res.ok) return { messages: [], nextCursor: null };

  return res.json() as Promise<{ messages: Message[]; nextCursor: string | null }>;
}

interface Props {
  params: Promise<{ address: string }>;
}

export default async function InboxPage({ params }: Props) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);

  const { messages, nextCursor } = await getMessages(decodedAddress, 'inbound');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Inbox</h2>
      <MessageList
        address={decodedAddress}
        direction="inbound"
        initialMessages={messages}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}
