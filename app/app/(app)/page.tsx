import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PREFERRED_ADDRESS_COOKIE } from '@/lib/preferences';
import { queryAddresses } from '@/lib/data/addresses';

export default async function DefaultPage() {
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
    redirect(`/inbox/${encodeURIComponent(target)}`);
  }

  redirect('/settings');
}
