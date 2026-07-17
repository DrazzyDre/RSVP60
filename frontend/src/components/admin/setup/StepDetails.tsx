"use client";

import * as React from "react";
import { forwardRef, useId, useImperativeHandle, useState } from "react";
import { ApiError } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/datetime";
import { EVENT_TYPES } from "@/lib/event-options";
import type { EventType } from "@/lib/types";
import type { SetupStepHandle, SetupStepProps } from "@/components/admin/setup/steps";
import { Field, StepError, patchEvent } from "@/components/admin/setup/step-utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Step 1 (edit mode): core event details for an existing draft. The initial
 * creation of the event happens on /admin/events/new; here we edit the same
 * fields on an already-persisted event.
 */
export const StepDetails = forwardRef<SetupStepHandle, SetupStepProps>(
  function StepDetails({ event, disabled }, ref) {
    const uid = useId();
    const [name, setName] = useState(event.name);
    const [eventType, setEventType] = useState<EventType>(event.event_type);
    const [eventDate, setEventDate] = useState(toLocalInput(event.event_date));
    const [eventTime, setEventTime] = useState(event.event_time);
    const [host, setHost] = useState(event.host_or_celebrant_name);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        async save() {
          if (!name.trim()) {
            setError("Please enter an event name.");
            return false;
          }
          setError(null);
          try {
            await patchEvent(event.id, {
              name: name.trim(),
              event_type: eventType,
              event_date: fromLocalInput(eventDate),
              event_time: eventTime,
              host_or_celebrant_name: host,
            });
            return true;
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not save details.");
            return false;
          }
        },
      }),
      [event.id, name, eventType, eventDate, eventTime, host]
    );

    return (
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Event name" htmlFor={`${uid}-name`} required>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Dad's 60th Birthday"
              required
            />
          </Field>
          <Field label="Event type" htmlFor={`${uid}-type`}>
            <Select
              id={`${uid}-type`}
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Event date & time"
            htmlFor={`${uid}-date`}
            hint="The date guests see on the invitation."
          >
            <Input
              id={`${uid}-date`}
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </Field>
          <Field
            label="Time note (optional)"
            htmlFor={`${uid}-time`}
            hint="A free-text override, e.g. “5:00 PM prompt”."
          >
            <Input
              id={`${uid}-time`}
              value={eventTime}
              maxLength={100}
              onChange={(e) => setEventTime(e.target.value)}
              placeholder="e.g. 5:00 PM prompt"
            />
          </Field>
        </div>
        <Field label="Host / celebrant name" htmlFor={`${uid}-host`}>
          <Input
            id={`${uid}-host`}
            value={host}
            maxLength={200}
            onChange={(e) => setHost(e.target.value)}
            placeholder="e.g. Chief Emmanuel Adeyemi"
          />
        </Field>
        <StepError error={error} />
      </fieldset>
    );
  }
);
