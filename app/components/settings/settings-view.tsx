'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Domain {
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

interface Address {
  email: string;
  domain: string;
  status: string;
}

interface SettingsViewProps {
  domains: Domain[];
  addresses: Address[];
}

function domainStatusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'Verified') return 'default';
  if (status === 'Pending') return 'secondary';
  return 'destructive';
}

function addressStatusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'active') return 'default';
  return 'secondary';
}

function addressStatusLabel(status: string): string {
  if (status === 'active') return 'Active';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function SettingsView({ domains, addresses }: SettingsViewProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      router.push('/login');
    } catch {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>SES Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                    No domains configured.
                  </TableCell>
                </TableRow>
              ) : (
                domains.map((d) => (
                  <TableRow key={d.domain}>
                    <TableCell className="font-medium">{d.domain}</TableCell>
                    <TableCell>
                      <Badge variant={domainStatusVariant(d.status)}>{d.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Addresses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addresses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    No addresses configured.
                  </TableCell>
                </TableRow>
              ) : (
                addresses.map((a) => (
                  <TableRow key={a.email}>
                    <TableCell className="font-medium">{a.email}</TableCell>
                    <TableCell className="text-muted-foreground">{a.domain}</TableCell>
                    <TableCell>
                      <Badge variant={addressStatusVariant(a.status)}>
                        {addressStatusLabel(a.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Separator />

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Account</h3>
        <Button
          variant="destructive"
          onClick={handleSignOut}
          disabled={isSigningOut}
          data-testid="sign-out-button"
        >
          {isSigningOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign out
        </Button>
      </div>
    </div>
  );
}
