import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PREFERRED_ADDRESS_COOKIE } from '@/lib/preferences';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

interface Address {
  email: string;
  domain: string;
  status: string;
}

export default async function DefaultPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const preferredAddress = cookieStore.get(PREFERRED_ADDRESS_COOKIE)?.value;

  const res = await fetch(`${BASE}/api/addresses`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });

  if (res.ok) {
    const { addresses = [] }: { addresses: Address[] } = await res.json();
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
  }

  redirect('/settings');
}
