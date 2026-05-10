import { cookies } from 'next/headers';
import { DomainList } from '@/components/domains/domain-list';

interface Domain {
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

async function fetchDomains(cookieHeader: string): Promise<Domain[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/domains`,
    { headers: { Cookie: cookieHeader }, cache: 'no-store' },
  );
  return res.ok ? ((await res.json()).domains ?? []) : [];
}

export default async function DomainsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const domains = await fetchDomains(cookieHeader);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Domains</h1>
      <DomainList domains={domains} />
    </div>
  );
}
