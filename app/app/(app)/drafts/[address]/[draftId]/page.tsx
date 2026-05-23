import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { ComposeEditor } from '@/components/drafts/compose-editor';

interface Draft {
  draftId: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
}

async function getDraft(draftId: string): Promise<Draft | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  if (!token) redirect('/login');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/drafts/${encodeURIComponent(draftId)}`, {
    headers: { Cookie: `access_token=${token}` },
    cache: 'no-store',
  });

  if (res.status === 401) redirect('/login');
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) return null;

  const data = await res.json();
  return data.draft ?? null;
}

interface Props {
  params: Promise<{ address: string; draftId: string }>;
}

export default async function DraftDetailPage({ params }: Props) {
  const { address, draftId } = await params;
  const decoded = decodeURIComponent(address);
  const draft = await getDraft(draftId);

  if (!draft) notFound();

  return <ComposeEditor draft={draft} address={decoded} />;
}
