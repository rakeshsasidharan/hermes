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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWs } from "@/components/ws-context";
import { useCompose } from "@/components/compose-context";
import {
  Inbox,
  Send,
  BookMarked,
  AlertCircle,
  Trash2,
  PenSquare,
  LogOut,
  ChevronDown,
  Mail,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Address {
  email: string;
  domain: string;
  status: string;
  unreadCount?: number;
}

interface AppSidebarProps {
  addresses: Address[];
}

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
  { key: "junk", label: "Junk", icon: AlertCircle, href: (addr: string) => `/junk/${encodeURIComponent(addr)}` },
  { key: "trash", label: "Trash", icon: Trash2, href: (addr: string) => `/trash/${encodeURIComponent(addr)}` },
];

export function AppSidebar({ addresses }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribe } = useWs();
  const { openCompose } = useCompose();

  const activeAddresses = addresses.filter((a) => a.status !== "deleted");

  const urlAddress = extractSelectedAddress(pathname);
  const selectedAddress =
    urlAddress && activeAddresses.some((a) => a.email === urlAddress)
      ? urlAddress
      : (activeAddresses[0]?.email ?? null);

  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const addr of addresses) {
      if (addr.unreadCount && addr.unreadCount > 0) {
        map.set(addr.email, addr.unreadCount);
      }
    }
    return map;
  });

  useEffect(() => {
    return subscribe((event) => {
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(event.address, (next.get(event.address) ?? 0) + 1);
        return next;
      });
    });
  }, [subscribe]);

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
  }

  function handleAddressSwitch(email: string) {
    const folder = FOLDERS.find((f) => pathname.startsWith(`/${f.key}/`));
    const target = folder ? folder.href(email) : `/inbox/${encodeURIComponent(email)}`;
    router.push(target);
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
                      className={cn(addr.email === selectedAddress && "font-medium")}
                    >
                      {addr.email}
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
                  onClick={() => openCompose(selectedAddress ? { from: selectedAddress } : undefined)}
                  data-testid="compose-button"
                  variant="btnDefault"
                >
                  <PenSquare />
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
                          <Link href={href} data-testid={`folder-link-${folder.key}`}>
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
            <SidebarMenuButton tooltip="Sign out" onClick={handleSignOut}>
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
