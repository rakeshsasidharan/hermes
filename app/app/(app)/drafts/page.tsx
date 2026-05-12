import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
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

async function getDrafts(): Promise<Draft[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    redirect('/login');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/drafts`, {
    headers: { Cookie: `access_token=${token}` },
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
  }

  if (!res.ok) return [];

  const data = await res.json();
  return data.drafts ?? [];
}

export default async function DraftsPage() {
  const drafts = await getDrafts();

  return <DraftsList drafts={drafts} />;
}
