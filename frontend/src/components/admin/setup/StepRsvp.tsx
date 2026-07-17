"use client";

import * as React from "react";
import { forwardRef, useId, useImperativeHandle, useState } from "react";
import { Info } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/datetime";
import type { SetupStepHandle, SetupStepProps } from "@/components/admin/setup/steps";
import { Field, StepError, patchEvent, useStepDirty } from "@/components/admin/setup/step-utils";
import { Input } from "@/components/ui/input";

/**
 * Step 3: event-level RSVP + host-notification settings. Capacity, waitlisting
 * and plus-one rules are governed per invite tree (allocated seats / plus-one),
 * not by event-level fields — so they live in the Invite trees step, and we only
 * expose the genuine event RSVP settings here (no invented fields).
 */
export const StepRsvp = forwardRef<SetupStepHandle, SetupStepProps>(
  function StepRsvp({ event, disabled }, ref) {
    const uid = useId();
    const [deadline, setDeadline] = useState(toLocalInput(event.rsvp_deadline));
    const [autoClose, setAutoClose] = useState(event.auto_close_rsvp);
    const [hostEmail, setHostEmail] = useState(event.host_notification_email);
    const [notifyExhausted, setNotifyExhausted] = useState(event.notify_tree_exhausted);
    const [notifyWaitlisted, setNotifyWaitlisted] = useState(event.notify_waitlisted_rsvp);
    const [error, setError] = useState<string | null>(null);
    const dirty = useStepDirty({
      deadline,
      autoClose,
      hostEmail,
      notifyExhausted,
      notifyWaitlisted,
    });

    useImperativeHandle(
      ref,
      () => ({
        async save() {
          if (
            deadline &&
            event.event_date &&
            new Date(deadline).getTime() > new Date(event.event_date).getTime()
          ) {
            setError("The RSVP deadline cannot be after the event date.");
            return false;
          }
          setError(null);
          try {
            await patchEvent(event.id, {
              rsvp_deadline: fromLocalInput(deadline),
              auto_close_rsvp: autoClose,
              host_notification_email: hostEmail,
              notify_tree_exhausted: notifyExhausted,
              notify_waitlisted_rsvp: notifyWaitlisted,
            });
            dirty.markClean();
            return true;
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not save RSVP settings.");
            return false;
          }
        },
        isDirty: dirty.isDirty,
      }),
      [
        event.id,
        event.event_date,
        deadline,
        autoClose,
        hostEmail,
        notifyExhausted,
        notifyWaitlisted,
        dirty,
      ]
    );

    return (
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="RSVP deadline"
            htmlFor={`${uid}-deadline`}
            hint="When RSVPs should close. Must not be after the event date."
          >
            <Input
              id={`${uid}-deadline`}
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">After the deadline</span>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-input bg-white px-3 text-sm">
              <input
                type="checkbox"
                checked={autoClose}
                onChange={(e) => setAutoClose(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-royal"
              />
              Close RSVPs automatically
            </label>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-semibold text-royal">Host email alerts</p>
          <p className="text-xs text-muted-foreground">
            Optional. When set, the host is emailed about key moments. Leave the
            address blank to disable host alerts for this event.
          </p>
          <Field label="Host notification email" htmlFor={`${uid}-hostemail`}>
            <Input
              id={`${uid}-hostemail`}
              type="email"
              value={hostEmail}
              maxLength={255}
              onChange={(e) => setHostEmail(e.target.value)}
              placeholder="host@example.com"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyExhausted}
              onChange={(e) => setNotifyExhausted(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-royal"
            />
            Alert when an invite allocation becomes full
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyWaitlisted}
              onChange={(e) => setNotifyWaitlisted(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-royal"
            />
            Alert when a guest is waitlisted because capacity is full
          </label>
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-royal/[0.04] px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-royal" aria-hidden />
          Capacity, waitlisting and plus-one rules are set per invite tree (seat
          allocation and plus-one) in the Invite trees step.
        </p>
        <StepError error={error} />
      </fieldset>
    );
  }
);
