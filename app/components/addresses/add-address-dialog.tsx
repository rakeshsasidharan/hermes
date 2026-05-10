'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AddAddressDialogProps {
  domains: string[];
  onSuccess: () => void;
}

export function AddAddressDialog({ domains, onSuccess }: AddAddressDialogProps) {
  const [open, setOpen] = useState(false);
  const [localPart, setLocalPart] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!localPart.trim() || !domain) {
      setError('Local part and domain are required');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const email = `${localPart.trim().toLowerCase()}@${domain}`;
      const res = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setLocalPart('');
        setDomain('');
        setOpen(false);
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to add address');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button>Add address</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add address</DialogTitle>
        </DialogHeader>
        {domains.length === 0 && (
          <Alert>
            <AlertDescription>
              Domain not verified —{' '}
              <Link href="/domains" className="font-medium underline underline-offset-4">
                Set up domain →
              </Link>
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="local-part">Local part</Label>
            <Input
              id="local-part"
              placeholder="hello"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain-select">Domain</Label>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger id="domain-select">
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                {domains.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !domain}>
              {isSubmitting ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
