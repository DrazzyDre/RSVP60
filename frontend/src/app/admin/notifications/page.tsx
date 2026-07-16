"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
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
import { SeverityIcon } from "@/components/admin/NotificationBell";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 50;
const SEVERITIES: NotificationSeverity[] = ["info", "success", "warning", "error"];

export default function NotificationsPage() {
  const router = useRouter();
  const { events } = useEvents();
  const { refresh } = useNotifications();

  const [eventId, setEventId] = useState<string>(""); // "" = all events
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [severity, setSeverity] = useState<string>("");

  const [items, setItems] = useState<AdminNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (eventId) {
      params.set("event_id", eventId);
      params.set("include_platform", "false");
    }
    if (unreadOnly) params.set("unread", "true");
    if (severity) params.set("severity", severity);
    return params;
  }, [eventId, unreadOnly, severity]);

  const load = useCallback(
    (nextOffset: number, append: boolean) => {
      const params = new URLSearchParams(scopeQuery);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(nextOffset));
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      api
        .get<NotificationPage>(`/api/admin/notifications?${params.toString()}`, true)
        .then((page) => {
          setTotal(page.total);
          setUnread(page.unread);
          setOffset(nextOffset);
          setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        })
        .catch((err) => setError(err.message ?? "Failed to load notifications."))
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [scopeQuery]
  );

  // Reload from the top whenever a filter changes.
  useEffect(() => {
    load(0, false);
  }, [load]);

  const markRead = useCallback(
    async (n: AdminNotification) => {
      if (!n.is_read) {
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
        setUnread((u) => Math.max(0, u - 1));
        try {
          await api.patch(`/api/admin/notifications/${n.id}/read`, {}, true);
        } catch {
          /* optimistic */
        }
        refresh();
      }
    },
    [refresh]
  );

  const onActivate = useCallback(
    (n: AdminNotification) => {
      void markRead(n);
      if (n.action_url) router.push(n.action_url);
    },
    [markRead, router]
  );

  const markAll = useCallback(async () => {
    const params = new URLSearchParams();
    if (eventId) {
      params.set("event_id", eventId);
      params.set("include_platform", "false");
    }
    const qs = params.toString();
    try {
      await api.patch<MarkAllReadResult>(
        `/api/admin/notifications/read-all${qs ? `?${qs}` : ""}`,
        {},
        true
      );
    } catch {
      /* ignore */
    }
    refresh();
    load(0, false);
  }, [eventId, refresh, load]);

  const hasMore = items.length < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Operational alerts across your events — failures, capacity and activity
            that may need attention.
          </p>
        </div>
        <Button variant="outline" onClick={markAll} disabled={unread === 0}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <FilterField label="Event">
          <Select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="h-10 w-56"
          >
            <option value="">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Severity">
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-10 w-40 capitalize"
          >
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-input bg-white px-3 text-sm">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Unread only
        </label>
        <div className="ml-auto self-center text-xs text-muted-foreground">
          {unread} unread · {total} total
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 font-medium text-foreground">No notifications</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {unreadOnly || severity || eventId
              ? "Nothing matches these filters."
              : "Operational alerts will appear here as they happen."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {items.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onActivate={onActivate}
              onMarkRead={markRead}
            />
          ))}
        </Card>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => load(offset + PAGE_SIZE, true)}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function NotificationRow({
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
        "flex items-start gap-3 px-4 py-4 transition-colors hover:bg-muted/50",
        !n.is_read && "bg-royal/[0.035]"
      )}
    >
      <span className="mt-0.5 flex-shrink-0">
        <SeverityIcon severity={n.severity} className="h-5 w-5" />
      </span>
      <button
        type="button"
        onClick={() => onActivate(n)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm",
              n.is_read ? "font-medium" : "font-semibold"
            )}
          >
            {n.title}
          </span>
          {!n.is_read && (
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-royal" aria-label="Unread" />
          )}
          {n.action_url && (
            <span className="text-xs font-medium text-royal/70 group-hover:underline">
              View →
            </span>
          )}
        </span>
        {n.message && (
          <span className="mt-1 block text-sm text-muted-foreground">{n.message}</span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground/80">
          <span className="capitalize">{n.severity}</span>
          <span aria-hidden>·</span>
          <span>{formatRelativeTime(n.created_at)}</span>
          <span aria-hidden>·</span>
          <span>{n.event_name ?? "Platform"}</span>
        </span>
      </button>
      {!n.is_read && (
        <button
          type="button"
          onClick={() => onMarkRead(n)}
          className="flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Mark read
        </button>
      )}
    </div>
  );
}
