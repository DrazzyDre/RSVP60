"use client";

import * as React from "react";
import { useEvents } from "@/components/admin/event-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { InviteTreesManager } from "@/components/admin/InviteTreesManager";
import { Skeleton } from "@/components/ui/skeleton";

export default function InviteTreesPage() {
  const { selectedEventId, selectedEvent, loading: eventsLoading } = useEvents();

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-royal">Invite Trees</h1>
        <p className="text-sm text-muted-foreground">
          {selectedEvent
            ? `Seat allocations for ${selectedEvent.name}`
            : "Seat allocations and secure invite links."}
        </p>
      </div>

      {eventsLoading || !selectedEventId ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <InviteTreesManager eventId={selectedEventId} event={selectedEvent} />
      )}
    </div>
  );
}
