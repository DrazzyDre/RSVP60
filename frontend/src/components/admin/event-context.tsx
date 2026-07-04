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
import { api } from "@/lib/api";
import type { EventAdmin } from "@/lib/types";

const STORAGE_KEY = "rsvp60_event";

interface EventContextValue {
  events: EventAdmin[];
  selectedEvent: EventAdmin | null;
  selectedEventId: string | null;
  setSelectedEventId: (id: string) => void;
  refreshEvents: () => Promise<EventAdmin[]>;
  loading: boolean;
}

const EventContext = createContext<EventContextValue | null>(null);

export function EventProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<EventAdmin[]>([]);
  const [selectedEventId, setId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshEvents = useCallback(async () => {
    const data = await api.get<EventAdmin[]>("/api/admin/events", true);
    setEvents(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    refreshEvents()
      .then((data) => {
        if (!active) return;
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
  }, []);

  // Keep the selection valid: if the currently selected event vanishes from the
  // list (archived/removed in another tab, or after a refresh), fall back to the
  // first available event rather than leaving a dangling id that breaks pages.
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
      refreshEvents,
      loading,
    }),
    [events, selectedEventId, setSelectedEventId, refreshEvents, loading]
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvents() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvents must be used within an EventProvider");
  return ctx;
}
