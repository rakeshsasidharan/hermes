import { cookies } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="max-w-3xl w-full">
      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
        </CardHeader>
        <CardContent>
          <DomainList domains={domains} />
        </CardContent>
      </Card>
    </div>
  );
}
