"use client";

import * as React from "react";
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarX2 } from "lucide-react";
import { useEvents } from "@/components/admin/event-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Event workspace boundary: /admin/e/[eventId]/…
 *
 * The URL's event id is the source of truth for the selected workspace. This
 * layout validates it against the admin's event list, syncs it into the event
 * context (which records it as last-opened + recent), and only then renders the
 * scoped pages — keyed by event id, so switching events fully remounts the
 * workspace. That remount is the systematic stale-data guard: no state, filter
 * or in-flight response from the previous event can survive into the next one.
 *
 * The id is NOT authorization — every API call below remains role-checked and
 * event-scoped by the backend.
 */
export default function EventWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;
  const { events, loading, selectedEventId, setSelectedEventId } = useEvents();

  const isValid = !loading && events.some((e) => e.id === eventId);

  // Adopt the URL's event as the selected workspace (never the reverse — an
  // invalid URL id is shown as unavailable rather than silently replaced).
  useEffect(() => {
    if (isValid && selectedEventId !== eventId) setSelectedEventId(eventId);
  }, [isValid, eventId, selectedEventId, setSelectedEventId]);

  if (loading) return <WorkspaceSkeleton />;

  if (!isValid) return <WorkspaceUnavailable />;

  // One-render gap while the context adopts the URL id: keep showing the
  // skeleton so pages never fetch or render under the previous event's id.
  if (selectedEventId !== eventId) return <WorkspaceSkeleton />;

  return <React.Fragment key={eventId}>{children}</React.Fragment>;
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading workspace">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

/** The URL references an event that does not exist or is not accessible. */
function WorkspaceUnavailable() {
  const { events, selectedEvent } = useEvents();
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-xl border border-dashed bg-white p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-royal/10 text-royal">
        <CalendarX2 className="h-7 w-7" />
      </div>
      <h1 className="mt-4 font-serif text-xl font-semibold text-royal">
        This event workspace isn&apos;t available
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The link may be out of date, or the event may have been removed. Pick an
        event from the switcher above, or browse all events.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/admin/events">
          <Button>View all events</Button>
        </Link>
        {selectedEvent && events.length > 0 && (
          <Link href={`/admin/e/${selectedEvent.id}`}>
            <Button variant="outline">Open “{selectedEvent.name}”</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
