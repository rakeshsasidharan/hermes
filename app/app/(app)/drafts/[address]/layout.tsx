import { MailboxLayout } from '@/components/layout/mailbox-layout';
import { DraftsList } from '@/components/drafts/drafts-list';

interface Props {
  params: Promise<{ address: string }>;
  children: React.ReactNode;
}

export default async function DraftsAddressLayout({ params, children }: Props) {
  const { address } = await params;
  const decoded = decodeURIComponent(address);

  return (
    <MailboxLayout
      list={<DraftsList address={decoded} />}
      detail={children}
    />
  );
}
