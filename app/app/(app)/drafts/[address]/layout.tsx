import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MailboxLayout } from '@/components/layout/mailbox-layout';
import { DraftsList } from '@/components/drafts/drafts-list';

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

async function getDrafts(address: string): Promise<Draft[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) redirect('/login');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(
    `${baseUrl}/api/drafts?from=${encodeURIComponent(address)}`,
    {
      headers: { Cookie: `access_token=${token}` },
      cache: 'no-store',
    },
  );

  if (res.status === 401) redirect('/login');
  if (!res.ok) return [];

  const data = await res.json();
  return data.drafts ?? [];
}

interface Props {
  params: Promise<{ address: string }>;
  children: React.ReactNode;
}

export default async function DraftsAddressLayout({ params, children }: Props) {
  const { address } = await params;
  const decoded = decodeURIComponent(address);
  const drafts = await getDrafts(decoded);

  return (
    <MailboxLayout
      list={
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 border-b px-4 h-14 shrink-0">
            <h2 className="font-semibold text-sm">Drafts</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <DraftsList drafts={drafts} />
          </div>
        </div>
      }
      detail={children}
    />
  );
}
