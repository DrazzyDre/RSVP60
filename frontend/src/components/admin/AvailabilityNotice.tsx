"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin-facing explanation of whether an event / invite tree can currently
 * accept RSVPs, and — when it cannot — a short, actionable next step. This is
 * the admin counterpart to the guest page's polite generic "closed" message; it
 * never exposes internal ids or implementation details.
 */

// What an admin should do to reopen RSVPs, per backend reason code.
const REASON_HINTS: Record<string, string> = {
  event_draft: "Set the event status to Active to open public RSVPs.",
  event_closed: "Reopen the event (set its status to Active) to accept RSVPs.",
  event_archived: "This event is archived — restore it to Active to accept RSVPs.",
  event_inactive: "Set the event status to Active to accept RSVPs.",
  tree_paused: "Reactivate this invite tree so its guests can RSVP.",
  deadline_passed:
    "The RSVP deadline has passed. Extend it, or turn off “close RSVPs automatically”.",
};

export function AvailabilityNotice({
  accepting,
  label,
  reason,
  className,
}: {
  accepting: boolean;
  label: string;
  reason?: string;
  className?: string;
}) {
  if (accepting) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800",
          className
        )}
      >
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600" />
        <span className="font-medium">Accepting RSVPs</span>
      </div>
    );
  }

  const hint = reason ? REASON_HINTS[reason] : undefined;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900",
        className
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      <div>
        <p className="font-medium">Not accepting RSVPs — {label}</p>
        {hint && <p className="mt-0.5 text-xs text-amber-800">{hint}</p>}
      </div>
    </div>
  );
}
