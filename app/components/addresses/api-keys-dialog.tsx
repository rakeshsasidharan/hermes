'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Copy, Check, Trash2, Plus, Loader2 } from 'lucide-react';

interface ApiKey {
  keyId: string;
  address: string;
  prefix: string;
  createdAt: string;
  label?: string;
}

interface ApiKeysDialogProps {
  email: string;
}

export function ApiKeysDialog({ email }: ApiKeysDialogProps) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/addresses/${encodeURIComponent(email)}/keys`);
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (open) fetchKeys();
  }, [open, fetchKeys]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/addresses/${encodeURIComponent(email)}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setKeys((prev) => [
          { keyId: data.keyId, address: data.address, prefix: data.prefix, createdAt: data.createdAt, label: data.label },
          ...prev,
        ]);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevoking(keyId);
    setKeys((prev) => prev.filter((k) => k.keyId !== keyId));
    try {
      await fetch(`/api/addresses/${encodeURIComponent(email)}/keys/${keyId}`, {
        method: 'DELETE',
      });
    } catch {
      await fetchKeys();
    } finally {
      setRevoking(null);
    }
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      setNewKey(null);
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1.5" data-testid={`api-keys-btn-${email}`}>
          <KeyRound className="h-3.5 w-3.5" />
          API Keys
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">API Keys — {email}</DialogTitle>
        </DialogHeader>

        {newKey && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-xs font-semibold">
              Copy this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted border rounded px-2 py-1.5 font-mono break-all">
                {newKey}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Active keys</p>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={handleGenerate}
              disabled={generating}
              data-testid={`generate-key-btn-${email}`}
            >
              {generating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />}
              Generate key
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No API keys yet. Generate one to get started.
            </p>
          ) : (
            <ul className="divide-y border rounded-md">
              {keys.map((k) => (
                <li key={k.keyId} className="flex items-center justify-between px-3 py-2.5 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-muted-foreground">{k.prefix}</code>
                      {k.label && (
                        <Badge variant="secondary" className="text-xs">{k.label}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {new Date(k.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => handleRevoke(k.keyId)}
                    disabled={revoking === k.keyId}
                    data-testid={`revoke-key-btn-${k.keyId}`}
                  >
                    {revoking === k.keyId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
