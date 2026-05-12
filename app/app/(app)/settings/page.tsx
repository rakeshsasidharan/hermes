import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SettingsView } from '@/components/settings/settings-view';

interface Domain {
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

interface Address {
  email: string;
  domain: string;
  status: string;
}

async function fetchDomains(cookieHeader: string): Promise<Domain[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/domains`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  return res.ok ? ((await res.json()).domains ?? []) : [];
}

async function fetchAddresses(cookieHeader: string): Promise<Address[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/addresses`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  return res.ok ? ((await res.json()).addresses ?? []) : [];
}

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [domains, addresses] = await Promise.all([
    fetchDomains(cookieHeader),
    fetchAddresses(cookieHeader),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsView domains={domains} addresses={addresses} />
    </div>
  );
}
