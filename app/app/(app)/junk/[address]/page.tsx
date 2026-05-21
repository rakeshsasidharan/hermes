import { ComingSoonPane } from '@/components/messages/coming-soon-pane';
import { MailboxLayout } from '@/components/layout/mailbox-layout';
import { MailboxEmptyState } from '@/components/messages/mailbox-empty-state';

export default function JunkPage() {
  return (
    <MailboxLayout
      list={<ComingSoonPane label="Junk" />}
      detail={<MailboxEmptyState />}
    />
  );
}
