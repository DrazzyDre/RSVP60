"use client";

import * as React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import type { UnreadCount } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";

/**
 * Shared unread-notification count for the admin shell (Phase 7).
 *
 * Owns a single lightweight poll of the unread-count endpoint (scoped to the
 * selected event + platform-level notifications) so every bell / badge in the
 * shell stays in sync without each one fetching independently. Bells fetch their
 * own dropdown lists on demand and call `refresh()` after marking things read.
 */
const POLL_MS = 60_000;

interface NotificationContextValue {
  unread: number;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { selectedEventId } = useEvents();
  const [unread, setUnread] = useState(0);
  // Keep the latest event id in a ref so the interval callback stays stable.
  const eventIdRef = useRef<string | null>(selectedEventId);
  eventIdRef.current = selectedEventId;

  const refresh = useCallback(() => {
    const q = eventIdRef.current
      ? `?event_id=${eventIdRef.current}&include_platform=true`
      : "";
    api
      .get<UnreadCount>(`/api/admin/notifications/unread-count${q}`, true)
      .then((r) => setUnread(r.unread))
      .catch(() => {
        /* transient — keep the last known count */
      });
  }, []);

  // Refresh on mount, whenever the selected event changes, and on a slow poll.
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, selectedEventId]);

  return (
    <NotificationContext.Provider value={{ unread, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotifications must be used within a NotificationProvider");
  return ctx;
}
