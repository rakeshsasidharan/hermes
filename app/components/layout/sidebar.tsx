"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWs } from "@/components/ws-context";
import {
  Inbox,
  Send,
  BookMarked,
  ArchiveX,
  Trash2,
  PenSquare,
  LogOut,
  ChevronDown,
  ChevronUp,
  Mail,
  Loader2,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isGuardActive, tryNavigate } from "@/lib/navigation-guard";

interface Address {
  email: string;
  domain: string;
  status: string;
  unreadCount?: number;
}

interface AppSidebarProps {
  addresses: Address[];
}

const PROFILE_NAV = [
  { key: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
] as const;

function extractSelectedAddress(pathname: string): string | null {
  const match = pathname.match(/^\/(inbox|sent|drafts|junk|trash)\/([^/]+)/);
  return match ? decodeURIComponent(match[2]) : null;
}

function FolderLinkInner({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="animate-spin" /> : <Icon />;
}

const FOLDERS = [
  { key: "inbox", label: "Inbox", icon: Inbox, href: (addr: string) => `/inbox/${encodeURIComponent(addr)}` },
  { key: "drafts", label: "Drafts", icon: BookMarked, href: (addr: string) => `/drafts/${encodeURIComponent(addr)}` },
  { key: "sent", label: "Sent", icon: Send, href: (addr: string) => `/sent/${encodeURIComponent(addr)}` },
  { key: "junk", label: "Junk", icon: ArchiveX, href: (addr: string) => `/junk/${encodeURIComponent(addr)}` },
  { key: "trash", label: "Trash", icon: Trash2, href: (addr: string) => `/trash/${encodeURIComponent(addr)}` },
];

export function AppSidebar({ addresses }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribe } = useWs();

  const activeAddresses = addresses
    .filter((a) => a.status !== "deleted")
    .sort((a, b) => {
      const domainCmp = a.domain.localeCompare(b.domain);
      if (domainCmp !== 0) return domainCmp;
      return a.email.localeCompare(b.email);
    });

  const urlAddress = extractSelectedAddress(pathname);
  const selectedAddress =
    urlAddress && activeAddresses.some((a) => a.email === urlAddress)
      ? urlAddress
      : (activeAddresses[0]?.email ?? null);

  const isOnDraftDetailRoute = /^\/drafts\/[^/]+\/[^/]+$/.test(pathname);
  const [isComposing, setIsComposing] = useState(false);
  const [switchingToAddress, setSwitchingToAddress] = useState<string | null>(null);

  // Reset loading states once navigation lands on any new page
  useEffect(() => {
    setIsComposing(false);
    setSwitchingToAddress(null);
  }, [pathname]);

  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const addr of addresses) {
      if (addr.unreadCount && addr.unreadCount > 0) {
        map.set(addr.email, addr.unreadCount);
      }
    }
    return map;
  });

  // Increment from WS events (best-effort; overridden by hermes:inboxcount when inbox is open)
  useEffect(() => {
    return subscribe((event) => {
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(event.address, (next.get(event.address) ?? 0) + 1);
        return next;
      });
    });
  }, [subscribe]);

  // Accurate count broadcast by MessageList on mount and on every local state change
  useEffect(() => {
    function onInboxCount(e: Event) {
      const { address: addr, unreadCount } = (e as CustomEvent<{ address: string; unreadCount: number }>).detail;
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(addr, unreadCount);
        return next;
      });
    }
    window.addEventListener('hermes:inboxcount', onInboxCount);
    return () => window.removeEventListener('hermes:inboxcount', onInboxCount);
  }, []);

  async function handleCompose() {
    if (!selectedAddress || isComposing || isOnDraftDetailRoute) return;
    setIsComposing(true);
    try {
      const existing = await findExistingNewDraft(selectedAddress);
      if (existing) {
        router.push(`/drafts/${encodeURIComponent(selectedAddress)}/${existing}`);
        return;
      }
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: selectedAddress }),
      });
      if (!res.ok) { setIsComposing(false); return; }
      const data = await res.json() as { draftId: string };
      router.push(`/drafts/${encodeURIComponent(selectedAddress)}/${data.draftId}`);
    } catch {
      setIsComposing(false);
    }
  }

  async function findExistingNewDraft(address: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/drafts?from=${encodeURIComponent(address)}`);
      if (!res.ok) return null;
      const data = await res.json() as {
        drafts?: Array<{ draftId: string; inReplyToMessageId?: string; to?: string; subject?: string; body?: string }>;
      };
      return data.drafts?.find(
        (d) => !d.inReplyToMessageId && !d.to && !d.subject && !d.body,
      )?.draftId ?? null;
    } catch {
      return null;
    }
  }

  function handleSignOut() {
    router.push("/login");
    fetch("/api/auth/signout", { method: "POST" });
  }

  function handleAddressSwitch(email: string) {
    const folder = FOLDERS.find((f) => pathname.startsWith(`/${f.key}/`));
    const target = folder ? folder.href(email) : `/inbox/${encodeURIComponent(email)}`;
    setSwitchingToAddress(email);
    tryNavigate(() => router.push(target));
  }

  const activeFolder = FOLDERS.find((f) => pathname.startsWith(`/${f.key}/`))?.key ?? null;
  const inboxUnread = selectedAddress ? (unreadCounts.get(selectedAddress) ?? 0) : 0;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Hermes">
              <Link href="/">
                <div className="flex aspect-square shrink-0 items-center justify-center">
                  <img src="/icon.svg" alt="Hermes" className="size-8 shrink-0 rounded-lg" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="text-base font-semibold">Hermes</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {activeAddresses.length > 0 && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={selectedAddress ?? "Select address"}
                    className="w-full"
                  >
                    <Mail className="shrink-0" />
                    <span className="truncate text-sm">{selectedAddress ?? "No address"}</span>
                    <ChevronDown className="ml-auto shrink-0 h-4 w-4 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {activeAddresses.map((addr) => (
                    <DropdownMenuItem
                      key={addr.email}
                      onSelect={() => handleAddressSwitch(addr.email)}
                      disabled={switchingToAddress !== null}
                      className={cn(addr.email === selectedAddress && "font-medium")}
                    >
                      {switchingToAddress === addr.email
                        ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        : <Mail className="h-4 w-4 shrink-0 opacity-0" />
                      }
                      <span className="flex-1 truncate">{addr.email}</span>
                      {(unreadCounts.get(addr.email) ?? 0) > 0 && (
                        <span className="ml-auto shrink-0 rounded-full bg-sidebar-primary px-1.5 py-0.5 text-xs font-medium text-sidebar-primary-foreground">
                          {unreadCounts.get(addr.email)}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Compose"
                  onClick={handleCompose}
                  data-testid="compose-button"
                  variant="btnDefault"
                  disabled={isComposing || isOnDraftDetailRoute}
                  aria-busy={isComposing}
                >
                  {isComposing
                    ? <Loader2 className="animate-spin" />
                    : <PenSquare />
                  }
                  <span>Compose</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {selectedAddress
                ? FOLDERS.map((folder) => {
                    const href = folder.href(selectedAddress);
                    const isActive = activeFolder === folder.key;
                    const showCount = folder.key === "inbox" && inboxUnread > 0;

                    return (
                      <SidebarMenuItem key={folder.key}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={folder.label}
                        >
                          <Link
                            href={href}
                            data-testid={`folder-link-${folder.key}`}
                            onClick={(e) => {
                              if (!isGuardActive()) return;
                              e.preventDefault();
                              tryNavigate(() => router.push(href));
                            }}
                          >
                            <FolderLinkInner icon={folder.icon} label={folder.label} />
                            <span>{folder.label}</span>
                            {showCount && (
                              <SidebarMenuBadge>{inboxUnread}</SidebarMenuBadge>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })
                : (
                  <SidebarMenuItem>
                    <span className="px-2 py-1.5 text-sm text-muted-foreground">
                      No addresses yet
                    </span>
                  </SidebarMenuItem>
                )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip="Options"
                  data-testid="profile-trigger"
                >
                  <SlidersHorizontal className="shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">Options</span>
                  <ChevronUp className="ml-auto shrink-0 h-4 w-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                {PROFILE_NAV.map(({ key, label, icon: Icon, href }) => {
                  const isActive = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <DropdownMenuItem
                      key={key}
                      asChild
                      className={cn(isActive && 'font-medium bg-accent')}
                    >
                      <Link href={href} data-testid={`profile-nav-${key}`}>
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleSignOut}
                  data-testid="profile-nav-signout"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
