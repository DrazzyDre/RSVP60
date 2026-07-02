"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, ExternalLink, Pencil, Users, ListTree } from "lucide-react";
import type { EventAdmin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EventForm } from "@/components/admin/EventForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { eventTypeLabel, formatDate } from "@/lib/utils";

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; event: EventAdmin };

const STATUS_BADGE: Record<string, string> = {
  active: "active",
  draft: "paused",
  closed: "exhausted",
  archived: "cancelled",
};

export default function EventsPage() {
  const { events, loading, refreshEvents, setSelectedEventId } = useEvents();
  const canEdit = useCanEdit();
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  async function handleSaved(saved: EventAdmin) {
    // Auto-select a newly created event (not present in the pre-refresh list).
    const isNew = !events.find((e) => e.id === saved.id);
    await refreshEvents();
    if (isNew) setSelectedEventId(saved.id);
    setMode({ kind: "list" });
  }

  if (mode.kind !== "list") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">
            {mode.kind === "new" ? "Create event" : "Edit event"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode.kind === "new"
              ? "Set up a new event. It becomes selectable in the event switcher."
              : "Update this event's invitation details and status."}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <EventForm
              event={mode.kind === "edit" ? mode.event : null}
              onSaved={handleSaved}
              onCancel={() => setMode({ kind: "list" })}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">Events</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage every event on RSVP60.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setMode({ kind: "new" })}>
            <CalendarPlus className="h-4 w-4" /> New event
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No events yet. Create your first event to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((ev) => (
            <Card key={ev.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{ev.name}</CardTitle>
                  <Badge status={STATUS_BADGE[ev.status] ?? "default"}>
                    {ev.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {eventTypeLabel(ev.event_type)} · {formatDate(ev.event_date)}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <ListTree className="h-4 w-4" /> {ev.tree_count} trees
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> {ev.rsvp_count} RSVPs
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMode({ kind: "edit", event: ev })}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedEventId(ev.id)}
                  >
                    Select
                  </Button>
                  <Link href="/admin/invite-trees">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedEventId(ev.id)}
                    >
                      <ExternalLink className="h-4 w-4" /> Invite trees
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
