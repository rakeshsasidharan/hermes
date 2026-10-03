import { cookies } from 'next/headers';
import { Loader2 } from 'lucide-react';
import { PREFERRED_ADDRESS_COOKIE } from '@/lib/preferences';
import { queryAddresses } from '@/lib/data/addresses';
import { InboxSkeleton } from '@/components/inbox/inbox-skeleton';
import { DefaultAddressRedirect } from './default-address-redirect';

export async function ResolveDefaultAddress() {
  const cookieStore = await cookies();
  const preferredAddress = cookieStore.get(PREFERRED_ADDRESS_COOKIE)?.value;

  const addresses = await queryAddresses();
  const active = addresses
    .filter((a) => a.status !== 'deleted')
    .sort((a, b) => {
      const dc = a.domain.localeCompare(b.domain);
      return dc !== 0 ? dc : a.email.localeCompare(b.email);
    });

  if (active.length > 0) {
    const target =
      preferredAddress && active.some((a) => a.email === preferredAddress)
        ? preferredAddress
        : active[0].email;
    return (
      <DefaultAddressRedirect href={`/inbox/${encodeURIComponent(target)}`}>
        <InboxSkeleton />
      </DefaultAddressRedirect>
    );
  }

  return (
    <DefaultAddressRedirect href="/settings">
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </DefaultAddressRedirect>
  );
}
