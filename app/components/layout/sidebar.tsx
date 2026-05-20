'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useWs } from '@/components/ws-context';
import { useCompose } from '@/components/compose-context';
import {
  Mail,
  Settings,
  LogOut,
  PenSquare,
  Globe,
  AtSign,
  Inbox,
  Send,
  BookMarked,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Address {
  email: string;
  domain: string;
  status: string;
  unreadCount?: number;
}

interface AppSidebarProps {
  addresses: Address[];
}

// Must be rendered inside <Link> so useLinkStatus() has context
function SubNavLinkInner({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? <Loader2 className="animate-spin" /> : <Icon />}
      <span>{label}</span>
    </>
  );
}

function SubNavLink({
  href,
  icon,
  label,
  isActive,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
}) {
  return (
    <SidebarMenuSubButton asChild isActive={isActive}>
      <Link href={href}>
        <SubNavLinkInner icon={icon} label={label} />
      </Link>
    </SidebarMenuSubButton>
  );
}

// Must be rendered inside <Link> so useLinkStatus() has context
function NavLinkInner({ icon: Icon }: { icon: React.ElementType }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="animate-spin" /> : <Icon />;
}

function NavLink({
  href,
  icon,
  label,
  isActive,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
}) {
  return (
    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
      <Link href={href}>
        <NavLinkInner icon={icon} />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}

export function AppSidebar({ addresses }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribe } = useWs();

  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const addr of addresses) {
      if (addr.unreadCount && addr.unreadCount > 0) {
        map.set(addr.email, addr.unreadCount);
      }
    }
    return map;
  });

  const [openAddresses, setOpenAddresses] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const addr of addresses) {
      set.add(addr.email);
    }
    return set;
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

  const { openCompose } = useCompose();

  function toggleAddress(email: string) {
    setOpenAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  }

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="Hermes"
              className="group-data-[collapsible=icon]:justify-center"
            >
              <Link href="/">
                <img src="/icon.svg" alt="Hermes" className="size-5 shrink-0" />
                <span className="text-base font-semibold group-data-[collapsible=icon]:hidden">
                  Hermes
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Compose"
                  onClick={() => openCompose()}
                  data-testid="compose-button"
                >
                  <PenSquare />
                  <span>Compose</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Inboxes</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {addresses.length === 0 && (
                <SidebarMenuItem>
                  <span className="px-2 py-1.5 text-sm text-muted-foreground">No addresses yet</span>
                </SidebarMenuItem>
              )}
              {addresses.map((addr) => {
                const inboxHref = `/inbox/${encodeURIComponent(addr.email)}`;
                const sentHref = `/sent/${encodeURIComponent(addr.email)}`;
                const draftsHref = `/drafts/${encodeURIComponent(addr.email)}`;
                const inboxActive = pathname.startsWith(inboxHref);
                const sentActive = pathname.startsWith(sentHref);
                const draftsActive = pathname.startsWith(draftsHref);
                const isAddressActive = inboxActive || sentActive || draftsActive;
                const count = unreadCounts.get(addr.email) ?? 0;
                const isOpen = openAddresses.has(addr.email);

                return (
                  <SidebarMenuItem key={addr.email}>
                    <SidebarMenuButton
                      tooltip={addr.email}
                      isActive={isAddressActive}
                      onClick={() => toggleAddress(addr.email)}
                    >
                      <Mail />
                      <span className="truncate">{addr.email}</span>
                      {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
                      <ChevronRight
                        className={cn(
                          'ml-auto shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden',
                          isOpen && 'rotate-90',
                        )}
                      />
                    </SidebarMenuButton>
                    {isOpen && (
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SubNavLink
                            href={inboxHref}
                            icon={Inbox}
                            label="Inbox"
                            isActive={inboxActive}
                          />
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SubNavLink
                            href={sentHref}
                            icon={Send}
                            label="Sent"
                            isActive={sentActive}
                          />
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SubNavLink
                            href={draftsHref}
                            icon={BookMarked}
                            label="Drafts"
                            isActive={draftsActive}
                          />
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NavLink
                  href="/addresses"
                  icon={AtSign}
                  label="Addresses"
                  isActive={pathname === '/addresses'}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink
                  href="/domains"
                  icon={Globe}
                  label="Domains"
                  isActive={pathname === '/domains'}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink
                  href="/settings"
                  icon={Settings}
                  label="Settings"
                  isActive={pathname === '/settings'}
                />
              </SidebarMenuItem>
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
