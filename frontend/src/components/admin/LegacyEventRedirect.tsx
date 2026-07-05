"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEvents } from "@/components/admin/event-context";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Compatibility shim for the pre-6.2 event-scoped admin routes
 * (/admin, /admin/rsvps, /admin/check-in?token=…, bookmarks, printed QR codes).
 *
 * Once the event list resolves, it redirects to the equivalent canonical
 * workspace route for the last-opened (or first) event, preserving the query
 * string so deep links like ?status= and ?token= keep working. With no events
 * at all it lands on /admin/events, which owns the no-events experience — that
 * page never redirects back here, so no loops are possible.
 */
export function LegacyEventRedirect({ segment }: { segment: string }) {
  const router = useRouter();
  const { events, selectedEventId, loading } = useEvents();

  useEffect(() => {
    if (loading) return;
    // selectedEventId is already reconciled to a valid event (or null).
    const target = selectedEventId ?? events[0]?.id ?? null;
    if (target) {
      router.replace(`/admin/e/${target}${segment}${window.location.search}`);
    } else {
      router.replace("/admin/events");
    }
  }, [loading, selectedEventId, events, segment, router]);

  return (
    <div className="space-y-6" aria-busy="true" aria-label="Opening workspace">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
