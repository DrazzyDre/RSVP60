"use client";

import * as React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { EventAdmin } from "@/lib/types";

// Last-opened event — a CONVENIENCE fallback only. On event-scoped routes
// (/admin/e/[eventId]/…) the URL is the source of truth and always wins.
const STORAGE_KEY = "rsvp60_event";
// Recently opened event ids (most recent first), for the workspace switcher.
const RECENT_KEY = "gatherarc_recent_events";
const RECENT_MAX = 5;

/** Path suffix after /admin/e/[eventId] (e.g. "/rsvps"), or "" for overview. */
export function scopedSuffix(pathname: string): string {
  const m = pathname.match(/^\/admin\/e\/[^/]+(\/.*)?$/);
  return m ? (m[1] ?? "") : "";
}

/** Canonical workspace URL for an event, preserving the current scoped page. */
export function workspacePath(eventId: string, pathname: string): string {
  return `/admin/e/${eventId}${scopedSuffix(pathname)}`;
}

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface EventContextValue {
  events: EventAdmin[];
  selectedEvent: EventAdmin | null;
  selectedEventId: string | null;
  /** Set the active workspace in context (called by the scoped route layout;
   *  also records it as last-opened + recent). Does NOT navigate. */
  setSelectedEventId: (id: string) => void;
  /** Navigate to an event's workspace, staying on the equivalent scoped page. */
  switchEvent: (id: string) => void;
  /** Recently opened event ids, most recent first (frontend-local). */
  recentEventIds: string[];
  refreshEvents: () => Promise<EventAdmin[]>;
  loading: boolean;
}

const EventContext = createContext<EventContextValue | null>(null);

export function EventProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [events, setEvents] = useState<EventAdmin[]>([]);
  const [selectedEventId, setId] = useState<string | null>(null);
  const [recentEventIds, setRecents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshEvents = useCallback(async () => {
    const data = await api.get<EventAdmin[]>("/api/admin/events", true);
    setEvents(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    setRecents(readRecents());
    refreshEvents()
      .then((data) => {
        if (!active) return;
        // Initial fallback selection (stored, else first). The event-scoped
        // route layout immediately overrides this with the URL's event id.
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const valid = data.find((e) => e.id === stored);
        setId(valid ? valid.id : (data[0]?.id ?? null));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshEvents]);

  const setSelectedEventId = useCallback((id: string) => {
    setId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    setRecents((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const switchEvent = useCallback(
    (id: string) => {
      // Stay on the equivalent workspace page (e.g. …/rsvps -> …/rsvps).
      // From platform pages there is no scoped suffix, so land on Overview.
      router.push(workspacePath(id, pathname));
    },
    [router, pathname]
  );

  // Keep the fallback selection valid: if the remembered event vanishes from
  // the list (deleted/archived elsewhere), fall back to the first available
  // event. This only adjusts CONTEXT state — an explicit URL event id is
  // validated separately by the scoped route layout and never overridden here.
  useEffect(() => {
    if (loading || selectedEventId === null) return;
    if (!events.some((e) => e.id === selectedEventId)) {
      const next = events[0]?.id ?? null;
      setId(next);
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [events, selectedEventId, loading]);

  const value = useMemo<EventContextValue>(
    () => ({
      events,
      selectedEvent: events.find((e) => e.id === selectedEventId) ?? null,
      selectedEventId,
      setSelectedEventId,
      switchEvent,
      recentEventIds,
      refreshEvents,
      loading,
    }),
    [
      events,
      selectedEventId,
      setSelectedEventId,
      switchEvent,
      recentEventIds,
      refreshEvents,
      loading,
    ]
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvents() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvents must be used within an EventProvider");
  return ctx;
}
