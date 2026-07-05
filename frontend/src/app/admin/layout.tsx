"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  ListTree,
  Loader2,
  LogOut,
  Mail,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { api, ApiError, clearToken, getToken } from "@/lib/api";
import type { Admin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AuthProvider } from "@/components/admin/auth-context";
import { EventProvider, useEvents } from "@/components/admin/event-context";
import { WorkspaceBar } from "@/components/admin/WorkspaceBar";
import { WorkspaceSwitcher } from "@/components/admin/WorkspaceSwitcher";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  ownerOnly?: boolean;
  exact?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

/**
 * Two navigation levels (Phase 6.2): the WORKSPACE group is scoped to the
 * selected event (canonical /admin/e/[eventId]/… routes); the PLATFORM group
 * is global (events portfolio, team, audit). Event switching itself lives in
 * the top workspace bar, not the sidebar.
 */
function buildNavGroups(eventId: string | null, isOwner: boolean): NavGroup[] {
  const groups: NavGroup[] = [];
  if (eventId) {
    const base = `/admin/e/${eventId}`;
    groups.push({
      label: "Workspace",
      items: [
        { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
        { href: `${base}/invite-trees`, label: "Invite Trees", icon: ListTree },
        { href: `${base}/rsvps`, label: "Guests / RSVPs", icon: Users },
        { href: `${base}/communications`, label: "Communications", icon: Mail },
        { href: `${base}/check-in`, label: "Check-in", icon: UserCheck },
        { href: `${base}/manifest`, label: "Manifest", icon: ClipboardList },
        { href: `${base}/settings`, label: "Event Settings", icon: Settings },
      ],
    });
  }
  groups.push({
    label: "Platform",
    items: [
      { href: "/admin/events", label: "Events", icon: CalendarRange },
      { href: "/admin/admins", label: "Admins", icon: ShieldCheck, ownerOnly: true },
      { href: "/admin/audit", label: "Audit", icon: ScrollText, ownerOnly: true },
    ].filter((item) => !item.ownerOnly || isOwner),
  });
  return groups;
}

function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setChecking(false);
      return;
    }
    if (!getToken()) {
      router.replace("/admin/login");
      return;
    }
    let active = true;
    api
      .get<Admin>("/api/admin/me", true)
      .then((a) => active && setAdmin(a))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace("/admin/login");
        }
      })
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) return <>{children}</>;

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-royal" />
      </div>
    );
  }

  function logout() {
    clearToken();
    router.replace("/admin/login");
  }

  return (
    <AuthProvider admin={admin}>
      <EventProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AdminShell admin={admin} pathname={pathname} onLogout={logout}>
              {children}
            </AdminShell>
          </ConfirmProvider>
        </ToastProvider>
      </EventProvider>
    </AuthProvider>
  );
}

function AdminShell({
  admin,
  pathname,
  onLogout,
  children,
}: {
  admin: Admin | null;
  pathname: string;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { selectedEventId } = useEvents();
  const isOwner = admin?.role === "owner";

  const groups = buildNavGroups(selectedEventId, isOwner);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/40 lg:flex-row print:h-auto print:overflow-visible">
      {/* Sidebar (desktop) — navigation only; workspace switching lives in the
          top bar. Fixed full height; does not scroll with content. */}
      <aside className="hidden w-64 flex-shrink-0 border-r bg-white lg:flex lg:flex-col print:hidden">
        <div className="border-b bg-royal p-5">
          <BrandLogo variant="light" priority className="h-7" />
          <p className="mt-2 text-xs text-white/70">Admin Console</p>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {groups.map((group) => (
            <NavSection key={group.label} group={group} pathname={pathname} />
          ))}
        </nav>
        <div className="border-t p-4">
          {admin && (
            <p className="mb-2 truncate px-2 text-xs text-muted-foreground">
              {admin.full_name || admin.email}
              {admin.role && (
                <span className="ml-1 capitalize text-muted-foreground/70">
                  · {admin.role}
                </span>
              )}
            </p>
          )}
          <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Content column — only this region scrolls */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col print:block print:min-h-0">
        {/* Desktop workspace bar */}
        <WorkspaceBar />

        {/* Mobile header: menu · brand · current-event switcher (one tap) */}
        <header className="flex items-center gap-2 border-b bg-white px-3 py-2.5 lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-input text-foreground hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo variant="mark" className="h-7 w-7 flex-shrink-0" />
          <WorkspaceSwitcher variant="compact" className="min-w-0 flex-1" />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 print:overflow-visible print:p-0">
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <BrandLogo variant="full" className="h-7" />
                <p className="mt-1 text-xs text-muted-foreground">Admin Console</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-4 overflow-y-auto p-3">
              {groups.map((group) => (
                <NavSection key={group.label} group={group} pathname={pathname} />
              ))}
            </nav>
            <div className="border-t p-4">
              {admin && (
                <p className="mb-2 truncate px-2 text-xs text-muted-foreground">
                  {admin.full_name || admin.email}
                </p>
              )}
              <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {group.label}
      </p>
      {group.items.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={isActive(item, pathname)}
        />
      ))}
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-royal text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
