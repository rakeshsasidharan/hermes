'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Globe,
  AtSign,
  Mail,
  Clock,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddDomainDialog } from '@/components/domains/add-domain-dialog';
import { AddAddressDialog } from '@/components/addresses/add-address-dialog';
import { DeleteAddressDialog } from '@/components/addresses/delete-address-dialog';

interface Domain {
  domain: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

interface Address {
  email: string;
  domain: string;
  status: string;
  createdAt: string;
}

interface Message {
  messageId: string;
  address: string;
  sender: string;
  subject: string;
  receivedAt: string;
  isRead: boolean;
}

interface SettingsViewProps {
  domains: Domain[];
  addresses: Address[];
  messageCounts: { total: number; unread: number };
  recentMessages: Message[];
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function SettingsView({
  domains: initialDomains,
  addresses: initialAddresses,
  messageCounts,
  recentMessages,
}: SettingsViewProps) {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>(initialDomains);
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set());

  function toggleDomain(d: string) {
    setOpenDomains((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  function handleDomainAdded() {
    router.refresh();
  }

  function handleDomainVerified(domainName: string) {
    setDomains((prev) =>
      prev.map((d) => (d.domain === domainName ? { ...d, status: 'Verified' } : d)),
    );
    router.refresh();
  }

  function handleAddressAdded(addr: Address) {
    setAddresses((prev) => [addr, ...prev]);
    router.refresh();
  }

  function handleAddressDeleted(email: string) {
    setAddresses((prev) => prev.filter((a) => a.email !== email));
  }

  const verifiedDomains = domains.filter((d) => d.status === 'Verified').map((d) => d.domain);

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Domains & Addresses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your custom identities and routing preferences.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <AddAddressDialog
            domains={verifiedDomains}
            onSuccess={handleAddressAdded}
            trigger={
              <Button variant="outline" data-testid="add-address-btn">
                + Add Address
              </Button>
            }
          />
          <AddDomainDialog
            onSuccess={handleDomainAdded}
            trigger={
              <Button data-testid="add-domain-btn">
                <Plus className="h-4 w-4 mr-1" />Add Domain
              </Button>
            }
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Domains
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">{pad2(domains.length)}</span>
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Addresses
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">{pad2(addresses.length)}</span>
              <span className="text-sm text-muted-foreground">Allocated</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-75">Messages</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold">{messageCounts.total}</span>
              <span className="text-sm opacity-75">Total</span>
            </div>
            <p className="mt-1 text-xs opacity-75">{messageCounts.unread} unread</p>
          </CardContent>
        </Card>
      </div>

      {/* Domain Accordions */}
      <div className="space-y-6">
        {domains.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No domains yet. Add one to get started.
            </CardContent>
          </Card>
        ) : (
          domains.map((d) => {
            const isOpen = openDomains.has(d.domain);
            const domainAddresses = addresses.filter((a) => a.domain === d.domain);

            return (
              <Card key={d.domain} className="overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
                  onClick={() => toggleDomain(d.domain)}
                  data-testid={`domain-row-${d.domain}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{d.domain}</span>
                      <DomainStatusBadge status={d.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.status === 'Verified'
                        ? `${domainAddresses.length} Address${domainAddresses.length !== 1 ? 'es' : ''}`
                        : 'Requires DNS configuration'}
                    </p>
                  </div>

                  {/* Verify Now — stop click propagation so it doesn't toggle accordion */}
                  {d.status !== 'Verified' && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <AddDomainDialog
                        initialDomain={d.domain}
                        onSuccess={() => handleDomainVerified(d.domain)}
                        trigger={
                          <Button variant="outline" size="sm" className="text-xs">
                            Verify Now
                          </Button>
                        }
                      />
                    </div>
                  )}

                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="border-t px-4 pb-4">
                    {d.status !== 'Verified' ? (
                      <p className="py-4 text-sm text-muted-foreground">
                        Verify your domain to start adding addresses.
                      </p>
                    ) : (
                      <>
                        {domainAddresses.length === 0 ? (
                          <p className="py-4 text-sm text-muted-foreground">No addresses yet.</p>
                        ) : (
                          <ul className="divide-y" data-testid={`address-list-${d.domain}`}>
                            {domainAddresses.map((addr) => (
                              <li
                                key={addr.email}
                                className="flex items-center justify-between py-3"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <AtSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm truncate">{addr.email}</span>
                                  <Badge
                                    variant={addr.status === 'active' ? 'default' : 'secondary'}
                                    className="text-xs shrink-0"
                                  >
                                    {addr.status}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    Added {new Date(addr.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <DeleteAddressDialog
                                  email={addr.email}
                                  onSuccess={() => handleAddressDeleted(addr.email)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="pt-3">
                          <AddAddressDialog
                            domains={[d.domain]}
                            defaultDomain={d.domain}
                            onSuccess={handleAddressAdded}
                            trigger={
                              <Button variant="outline" size="sm" className="text-xs">
                                + Add address
                              </Button>
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No messages yet</p>
          ) : (
            <ul className="space-y-1">
              {recentMessages.map((msg) => (
                <li key={msg.messageId}>
                  <Link
                    href={`/inbox/${encodeURIComponent(msg.address)}/${msg.messageId}`}
                    className="flex items-start gap-3 rounded-md p-2 hover:bg-accent transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-sm truncate',
                            !msg.isRead ? 'font-semibold' : 'font-normal',
                          )}
                        >
                          {msg.subject || '(no subject)'}
                        </span>
                        {!msg.isRead && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">{msg.sender}</span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-xs text-muted-foreground truncate">{msg.address}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(msg.receivedAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DomainStatusBadge({ status }: { status: 'Verified' | 'Pending' | 'Failed' }) {
  if (status === 'Verified') {
    return <Badge variant="default" className="text-xs">✓ Verified</Badge>;
  }
  if (status === 'Pending') {
    return <Badge variant="secondary" className="text-xs text-amber-600 border-amber-200 bg-amber-50">⏳ Pending</Badge>;
  }
  return <Badge variant="destructive" className="text-xs">✗ Failed</Badge>;
}
