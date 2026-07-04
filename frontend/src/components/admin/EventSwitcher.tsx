"use client";

import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { useEvents } from "./event-context";
import { Select } from "@/components/ui/select";
import { eventTypeLabel } from "@/lib/utils";

export function EventSwitcher() {
  const { events, selectedEventId, setSelectedEventId, loading } = useEvents();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5" />
        Current event
      </div>
      {loading ? (
        <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
      ) : events.length === 0 ? (
        <Link
          href="/admin/events/new"
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Create your first event
        </Link>
      ) : (
        <Select
          value={selectedEventId ?? ""}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="h-11"
          aria-label="Select current event"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </Select>
      )}
      <div className="flex items-center justify-between px-0.5">
        <SelectedMeta />
        <div className="flex items-center gap-3">
          {events.length > 0 && (
            <Link
              href="/admin/events/new"
              className="flex items-center gap-0.5 text-xs font-medium text-royal hover:underline"
            >
              <Plus className="h-3 w-3" /> New
            </Link>
          )}
          <Link
            href="/admin/events"
            className="text-xs font-medium text-royal hover:underline"
          >
            Manage
          </Link>
        </div>
      </div>
    </div>
  );
}

function SelectedMeta() {
  const { selectedEvent } = useEvents();
  if (!selectedEvent) return <span />;
  return (
    <span className="text-xs text-muted-foreground">
      {eventTypeLabel(selectedEvent.event_type)} · {selectedEvent.status}
    </span>
  );
}
