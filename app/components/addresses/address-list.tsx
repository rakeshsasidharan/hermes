'use client';

import { useEffect, useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setAddresses(initial);
  }, [initial]);

  function handleAddSuccess(address: Address) {
    setAddresses((prev) => [address, ...prev]);
    setSuccessMessage(`${address.email} added successfully`);
    setTimeout(() => setSuccessMessage(null), 4000);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {successMessage && (
        <Alert>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end">
        <AddAddressDialog domains={domains} onSuccess={handleAddSuccess} />
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
