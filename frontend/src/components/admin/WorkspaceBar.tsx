"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  ListChecks,
  Loader2,
} from "lucide-react";
import { useEvents } from "@/components/admin/event-context";
import { useAuth, useCanEdit } from "@/components/admin/auth-context";
import { usePreviewInvite } from "@/components/admin/PreviewInviteButton";
import { WorkspaceSwitcher } from "@/components/admin/WorkspaceSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Persistent desktop workspace bar: the event workspace selector, a prominent
 * New event action (owner/admin), and at-a-glance preview / readiness /
 * availability / account controls for the selected event.
 */
export function WorkspaceBar() {
  const { selectedEvent, selectedEventId } = useEvents();
  const admin = useAuth();
  const canEdit = useCanEdit();
  const { preview, loading: previewLoading } = usePreviewInvite();

  const settingsHref = selectedEventId
    ? `/admin/e/${selectedEventId}/settings`
    : "/admin/events";

  return (
    <div className="hidden items-center gap-3 border-b bg-white px-4 py-2.5 lg:flex print:hidden">
      <WorkspaceSwitcher variant="bar" className="w-80 max-w-[24rem]" />

      {canEdit && (
        <Link href="/admin/events/new">
          <Button size="sm">
            <CalendarPlus className="h-4 w-4" /> New event
          </Button>
        </Link>
      )}

      <div className="ml-auto flex items-center gap-2">
        {selectedEvent && (
          <>
            {!selectedEvent.accepting_rsvps && (
              <Link
                href={settingsHref}
                className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:border-amber-300"
                title={selectedEvent.availability_label}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                RSVPs closed
                <span className="hidden font-normal text-amber-800 xl:inline">
                  · {selectedEvent.availability_label}
                </span>
              </Link>
            )}
            <ReadinessChip
              href={settingsHref}
              completed={selectedEvent.readiness_completed}
              total={selectedEvent.readiness_total}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => preview(selectedEventId)}
              disabled={previewLoading}
            >
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Preview
            </Button>
          </>
        )}
        {admin && (
          <Link
            href={settingsHref}
            aria-label={`Account: ${admin.full_name || admin.email} (${admin.role})`}
            title={`${admin.full_name || admin.email} · ${admin.role}`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-royal text-xs font-bold uppercase text-ivory transition-opacity hover:opacity-90"
          >
            {(admin.full_name || admin.email).slice(0, 2)}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Compact readiness state for the selected event; opens Event Settings. */
function ReadinessChip({
  href,
  completed,
  total,
}: {
  href: string;
  completed: number;
  total: number;
}) {
  if (!total) return null;
  const ready = completed >= total;
  return (
    <Link
      href={href}
      title="Open event readiness"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        ready
          ? "border-green-200 bg-green-50 text-green-800 hover:border-green-300"
          : "border-input bg-white text-muted-foreground hover:bg-muted"
      )}
    >
      {ready ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden />
      ) : (
        <ListChecks className="h-3.5 w-3.5" aria-hidden />
      )}
      {ready ? "Ready to share" : `Ready ${completed}/${total}`}
    </Link>
  );
}
