'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AddDomainDialog } from './add-domain-dialog';

interface Domain {
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

interface DomainListProps {
  domains: Domain[];
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'Verified') return 'default';
  if (status === 'Pending') return 'secondary';
  return 'destructive';
}

export function DomainList({ domains: initial }: DomainListProps) {
  const router = useRouter();
  const [domains] = useState<Domain[]>(initial);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddDomainDialog onSuccess={refresh} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Domain</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {domains.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                No domains yet. Add one to get started.
              </TableCell>
            </TableRow>
          ) : (
            domains.map((d) => (
              <TableRow key={d.domain}>
                <TableCell className="font-medium">{d.domain}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
