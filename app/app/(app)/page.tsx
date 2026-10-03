import { Suspense } from 'react';
import { InboxSkeleton } from '@/components/inbox/inbox-skeleton';
import { ResolveDefaultAddress } from './resolve-default-address';

export default function DefaultPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <ResolveDefaultAddress />
    </Suspense>
  );
}
