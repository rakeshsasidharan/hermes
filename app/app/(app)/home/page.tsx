import { cookies } from 'next/headers';
import { AddressList } from '@/components/addresses/address-list';

async function fetchAddresses(cookieHeader: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/addresses`,
    { headers: { Cookie: cookieHeader }, cache: 'no-store' },
  );
  return res.ok ? ((await res.json()).addresses ?? []) : [];
}

async function fetchDomains(cookieHeader: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/domains`,
    { headers: { Cookie: cookieHeader }, cache: 'no-store' },
  );
  return res.ok ? ((await res.json()).domains ?? []) : [];
}

export default async function AddressesPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const [addresses, rawDomains] = await Promise.all([
    fetchAddresses(cookieHeader),
    fetchDomains(cookieHeader),
  ]);
  const verifiedDomains = rawDomains
    .filter((d: { status: string }) => d.status === 'Verified')
    .map((d: { domain: string }) => d.domain);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Addresses</h1>
      <AddressList addresses={addresses} domains={verifiedDomains} />
    </div>
  );
}
