"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarRange,
  LayoutDashboard,
  ListTree,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  Loader2,
} from "lucide-react";
import { api, ApiError, clearToken, getToken } from "@/lib/api";
import type { Admin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AuthProvider } from "@/components/admin/auth-context";
import { EventProvider } from "@/components/admin/event-context";
import { EventSwitcher } from "@/components/admin/EventSwitcher";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  ownerOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/events", label: "Events", icon: CalendarRange },
  { href: "/admin/invite-trees", label: "Invite Trees", icon: ListTree },
  { href: "/admin/rsvps", label: "RSVPs", icon: Users },
  { href: "/admin/admins", label: "Admins", icon: ShieldCheck, ownerOnly: true },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

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

  const isOwner = admin?.role === "owner";
  const nav = NAV.filter((item) => !item.ownerOnly || isOwner);

  return (
    <AuthProvider admin={admin}>
      <EventProvider>
      <div className="min-h-screen bg-muted/40 lg:flex">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-64 flex-shrink-0 border-r bg-white lg:flex lg:flex-col">
          <div className="border-b p-6">
            <p className="font-serif text-xl font-bold text-royal">RSVP60</p>
            <p className="text-xs text-muted-foreground">Admin Console</p>
          </div>
          <div className="border-b p-4">
            <EventSwitcher />
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {nav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                pathname={pathname}
              />
            ))}
          </nav>
          <div className="border-t p-4">
            {admin && (
              <p className="mb-2 truncate px-2 text-xs text-muted-foreground">
                {admin.full_name || admin.email}
              </p>
            )}
            <Button variant="ghost" className="w-full justify-start" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="flex min-w-0 flex-col lg:flex-1">
          <header className="flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
            <p className="font-serif text-lg font-bold text-royal">RSVP60</p>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </header>

          {/* Mobile event switcher */}
          <div className="border-b bg-white p-3 lg:hidden">
            <EventSwitcher />
          </div>

          {/* Mobile nav */}
          <nav className="flex gap-1 overflow-x-auto border-b bg-white px-2 py-2 lg:hidden">
            {nav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                pathname={pathname}
                compact
              />
            ))}
          </nav>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
      </EventProvider>
    </AuthProvider>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
  compact,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  pathname: string;
  compact?: boolean;
}) {
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        compact && "flex-shrink-0",
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
