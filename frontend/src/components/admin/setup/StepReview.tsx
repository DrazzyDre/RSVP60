"use client";

import * as React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { CheckCircle2, ImageOff, Loader2, Rocket, TreePine } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { EventAdmin } from "@/lib/types";
import { eventTypeLabel, formatDate } from "@/lib/utils";
import {
  SETUP_STEPS,
  stepCompletion,
  type SetupStepHandle,
  type SetupStepKey,
  type SetupStepProps,
} from "@/components/admin/setup/steps";
import { patchEvent } from "@/components/admin/setup/step-utils";
import { EventReadiness } from "@/components/admin/EventReadiness";
import { AvailabilityNotice } from "@/components/admin/AvailabilityNotice";
import { PreviewInviteButton } from "@/components/admin/PreviewInviteButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";

const STATUS_BADGE: Record<string, string> = {
  active: "active",
  draft: "paused",
  closed: "exhausted",
  archived: "cancelled",
};

/**
 * Step 6: review readiness and deliberately activate. Uses the backend
 * readiness + availability evaluation (never a re-implemented copy). Activation
 * is a separate, explicit action — never automatic and never part of a "save".
 */
export const StepReview = forwardRef<
  SetupStepHandle,
  SetupStepProps & {
    canEdit: boolean;
    onNavigate: (key: SetupStepKey) => void;
    onActivated: () => void;
  }
>(function StepReview({ event, canEdit, onNavigate, onActivated }, ref) {
  const toast = useToast();
  const confirm = useConfirm();
  const [activating, setActivating] = useState(false);

  // Review has nothing of its own to persist.
  useImperativeHandle(ref, () => ({ save: async () => true }), []);

  const done = stepCompletion(event);
  const unresolved = SETUP_STEPS.filter((s) => s.key !== "review" && !done[s.key]);
  const hasFlyer = Boolean(event.flyer_storage_path || event.flyer_url);
  const isActive = event.status === "active";

  async function activate() {
    const ok = await confirm({
      title: `Activate “${event.name}”?`,
      description:
        "Guests using an active invite link will be able to RSVP (subject to the deadline and each tree's status). You can pause or close it later.",
      confirmLabel: "Activate event",
      cancelLabel: "Not yet",
    });
    if (!ok) return;
    setActivating(true);
    try {
      await patchEvent(event.id, { status: "active" });
      toast.success(`“${event.name}” is now live.`);
      onActivated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not activate the event.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-semibold text-royal">{event.name}</h3>
          <Badge status={STATUS_BADGE[event.status] ?? "default"}>{event.status}</Badge>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
          <Summary label="Type" value={eventTypeLabel(event.event_type)} />
          <Summary label="Date" value={formatDate(event.event_date)} />
          <Summary
            label="Invite trees"
            value={`${event.tree_count} ${event.tree_count === 1 ? "tree" : "trees"}`}
          />
          <Summary label="Flyer" value={hasFlyer ? "Added" : "Not added"} />
        </div>
      </div>

      {/* Availability — why the event can/can't accept RSVPs right now. */}
      <AvailabilityNotice
        accepting={event.accepting_rsvps}
        label={event.availability_label}
        reason={event.availability_reason}
      />

      {/* Readiness checklist (authoritative, from the backend). */}
      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-semibold text-royal">Readiness</p>
        <EventReadiness eventId={event.id} />
      </div>

      {/* Unresolved steps with links back to fix them. */}
      {unresolved.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Still worth finishing</p>
          <ul className="mt-2 space-y-2">
            {unresolved.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-amber-900">{s.title}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate(s.key)}
                >
                  Go to step
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {event.tree_count === 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <TreePine className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          This event has no invite trees yet — without at least one, guests have no
          link to RSVP through even after activation.
        </p>
      )}
      {!hasFlyer && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          <ImageOff className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          No flyer image yet — add one in the Branding step for a richer invitation.
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <PreviewInviteButton eventId={event.id} label="Preview invitation" />
        {canEdit &&
          (isActive ? (
            <span className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Event is live
            </span>
          ) : (
            <Button onClick={activate} disabled={activating}>
              {activating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {activating ? "Activating…" : "Activate event"}
            </Button>
          ))}
      </div>
      {!isActive && canEdit && (
        <p className="text-xs text-muted-foreground">
          Activation is deliberate — the event stays a private draft until you
          choose to go live.
        </p>
      )}
    </div>
  );
});

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center justify-between border-b border-border/60 py-1 last:border-0 sm:border-0">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </p>
  );
}
