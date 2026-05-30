'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

interface DomainStatus {
  ses: 'Verified' | 'Pending' | 'Failed';
  dkim: 'Verified' | 'Pending' | 'Failed';
}

interface AddDomainDialogProps {
  onSuccess: () => void;
  trigger?: React.ReactNode;
  initialDomain?: string;
}

export function AddDomainDialog({ onSuccess, trigger, initialDomain }: AddDomainDialogProps) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollingDomain, setPollingDomain] = useState<string | null>(null);
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When an initialDomain is provided and the dialog opens, jump straight to polling
  useEffect(() => {
    if (open && initialDomain && !pollingDomain) {
      setPollingDomain(initialDomain);
      setStatus({ ses: 'Pending', dkim: 'Pending' });
    }
  }, [open, initialDomain, pollingDomain]);

  useEffect(() => {
    if (!pollingDomain) return;

    async function checkStatus() {
      const res = await fetch(`/api/domains/${encodeURIComponent(pollingDomain!)}/status`);
      if (!res.ok) return;
      const data: DomainStatus = await res.json();
      setStatus(data);
      if (data.ses === 'Verified' && data.dkim === 'Verified') {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        onSuccess();
      }
    }

    checkStatus();
    intervalRef.current = setInterval(checkStatus, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollingDomain, onSuccess]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) {
      setError('Domain name is required');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/domains/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim().toLowerCase() }),
      });
      if (res.ok) {
        setPollingDomain(domain.trim().toLowerCase());
        setStatus({ ses: 'Pending', dkim: 'Pending' });
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to initiate domain setup');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose(next: boolean) {
    if (!next) {
      setDomain('');
      setError(null);
      setPollingDomain(null);
      setStatus(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    setOpen(next);
  }

  const bothVerified = status?.ses === 'Verified' && status?.dkim === 'Verified';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger ?? <Button>Add domain</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialDomain ? `Verify ${initialDomain}` : 'Add domain'}</DialogTitle>
        </DialogHeader>

        {!pollingDomain ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="domain-input">Domain name</Label>
              <Input
                id="domain-input"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up…
                  </>
                ) : (
                  'Set up domain'
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Verifying <span className="font-medium text-foreground">{pollingDomain}</span>.
              This may take a few minutes.
            </p>
            <div className="space-y-2 rounded-md border p-4">
              <StatusRow label="SES verification" status={status?.ses ?? 'Pending'} />
              <StatusRow label="DKIM" status={status?.dkim ?? 'Pending'} />
            </div>
            {bothVerified && (
              <Alert>
                <AlertDescription>
                  Domain verified successfully! You can now add email addresses.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => handleClose(false)}>
                {bothVerified ? 'Close' : 'Cancel'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: 'Verified' | 'Pending' | 'Failed';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      {status === 'Verified' ? (
        <Badge variant="default" className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Verified
        </Badge>
      ) : status === 'Failed' ? (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      ) : (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Pending
        </Badge>
      )}
    </div>
  );
}
