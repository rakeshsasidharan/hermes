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
import { AddAddressDialog } from './add-address-dialog';
import { DeleteAddressDialog } from './delete-address-dialog';

interface Address {
  email: string;
  domain: string;
  status: string;
  createdAt: string;
}

interface AddressListProps {
  addresses: Address[];
  domains: string[];
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'active') return 'default';
  if (status === 'pending') return 'secondary';
  return 'destructive';
}

export function AddressList({ addresses: initial, domains }: AddressListProps) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>(initial);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddAddressDialog domains={domains} onSuccess={refresh} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {addresses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No addresses yet. Add one to get started.
              </TableCell>
            </TableRow>
          ) : (
            addresses.map((addr) => (
              <TableRow key={addr.email}>
                <TableCell className="font-medium">{addr.email}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(addr.status)}>{addr.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(addr.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <DeleteAddressDialog
                    email={addr.email}
                    onSuccess={() => {
                      setAddresses((prev) => prev.filter((a) => a.email !== addr.email));
                    }}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
