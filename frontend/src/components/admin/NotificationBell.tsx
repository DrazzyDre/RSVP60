"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  AdminNotification,
  MarkAllReadResult,
  NotificationPage,
  NotificationSeverity,
} from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useEvents } from "@/components/admin/event-context";
import { useNotifications } from "@/components/admin/notification-context";

/** Shared severity presentation (icon + colour) for the bell and full page. */
export const SEVERITY_META: Record<
  NotificationSeverity,
  { icon: React.ElementType; className: string; label: string }
> = {
  info: { icon: Info, className: "text-royal", label: "Info" },
  success: { icon: CheckCircle2, className: "text-green-600", label: "Success" },
  warning: { icon: AlertTriangle, className: "text-amber-600", label: "Warning" },
  error: { icon: XCircle, className: "text-red-600", label: "Error" },
};

export function SeverityIcon({
  severity,
  className,
}: {
  severity: NotificationSeverity;
  className?: string;
}) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
  const Icon = meta.icon;
  return <Icon className={cn("h-4 w-4", meta.className, className)} aria-hidden />;
}

/**
 * Bell + unread badge + dropdown of the newest notifications for the workspace.
 * The unread badge is driven by the shared NotificationProvider; the dropdown
 * list is fetched on demand when opened.
 */
export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const { selectedEventId } = useEvents();
  const { unread, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const scopeQuery = selectedEventId
    ? `event_id=${selectedEventId}&include_platform=true`
    : "";

  const loadRecent = useCallback(() => {
    setLoading(true);
    const q = `?limit=8${scopeQuery ? `&${scopeQuery}` : ""}`;
    api
      .get<NotificationPage>(`/api/admin/notifications${q}`, true)
      .then((page) => setItems(page.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [scopeQuery]);

  // Load the list when the panel opens.
  useEffect(() => {
    if (open) loadRecent();
  }, [open, loadRecent]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = useCallback(
    async (n: AdminNotification) => {
      if (n.is_read) return;
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      try {
        await api.patch(`/api/admin/notifications/${n.id}/read`, {}, true);
      } catch {
        /* optimistic — a failed mark-read will self-correct on next poll */
      }
      refresh();
    },
    [refresh]
  );

  const onActivate = useCallback(
    (n: AdminNotification) => {
      void markRead(n);
      setOpen(false);
      if (n.action_url) router.push(n.action_url);
    },
    [markRead, router]
  );

  const markAll = useCallback(async () => {
    const q = scopeQuery ? `?${scopeQuery}` : "";
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    try {
      await api.patch<MarkAllReadResult>(
        `/api/admin/notifications/read-all${q}`,
        {},
        true
      );
    } catch {
      /* ignore; poll will reconcile */
    }
    refresh();
  }, [scopeQuery, refresh]);

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unread > 0 ? `Notifications (${unread} unread)` : "Notifications"
        }
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-input bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[1.15rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold text-royal">Notifications</p>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-6 w-6 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li key={n.id}>
                    <DropdownRow n={n} onActivate={onActivate} onMarkRead={markRead} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t px-4 py-2 text-center">
            <Link
              href="/admin/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-royal hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownRow({
  n,
  onActivate,
  onMarkRead,
}: {
  n: AdminNotification;
  onActivate: (n: AdminNotification) => void;
  onMarkRead: (n: AdminNotification) => void;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
        !n.is_read && "bg-royal/[0.035]"
      )}
    >
      <button
        type="button"
        onClick={() => onActivate(n)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <span className="mt-0.5 flex-shrink-0">
          <SeverityIcon severity={n.severity} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm",
                n.is_read ? "font-medium text-foreground" : "font-semibold text-foreground"
              )}
            >
              {n.title}
            </span>
            {!n.is_read && (
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-royal" aria-label="Unread" />
            )}
          </span>
          {n.message && (
            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
              {n.message}
            </span>
          )}
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            {formatRelativeTime(n.created_at)}
            {n.event_name && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{n.event_name}</span>
              </>
            )}
          </span>
        </span>
      </button>
      {!n.is_read && (
        <button
          type="button"
          onClick={() => onMarkRead(n)}
          aria-label="Mark as read"
          title="Mark as read"
          className="mt-0.5 flex-shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
