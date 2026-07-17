"use client";

import * as React from "react";
import { forwardRef, useId, useImperativeHandle, useState } from "react";
import { ApiError } from "@/lib/api";
import type { SetupStepHandle, SetupStepProps } from "@/components/admin/setup/steps";
import { Field, StepError, patchEvent } from "@/components/admin/setup/step-utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Step 2: the public invitation content guests see. */
export const StepInvitation = forwardRef<SetupStepHandle, SetupStepProps>(
  function StepInvitation({ event, disabled }, ref) {
    const uid = useId();
    const [form, setForm] = useState({
      title: event.title,
      invite_headline: event.invite_headline,
      invite_message: event.invite_message,
      description: event.description,
      venue_name: event.venue_name,
      venue_address: event.venue_address,
      maps_url: event.maps_url,
      dress_code: event.dress_code,
      gift_details: event.gift_details,
      contact_phone: event.contact_phone,
    });
    const [error, setError] = useState<string | null>(null);

    function set<K extends keyof typeof form>(key: K, value: string) {
      setForm((f) => ({ ...f, [key]: value }));
    }

    useImperativeHandle(
      ref,
      () => ({
        async save() {
          setError(null);
          try {
            await patchEvent(event.id, { ...form });
            return true;
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not save invitation details.");
            return false;
          }
        },
      }),
      [event.id, form]
    );

    return (
      <fieldset disabled={disabled} className="space-y-5">
        <Field label="Invite title / tagline" htmlFor={`${uid}-title`}>
          <Input
            id={`${uid}-title`}
            value={form.title}
            maxLength={200}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. A Diamond Celebration at 60"
          />
        </Field>
        <Field label="Invite headline (short banner line)" htmlFor={`${uid}-headline`}>
          <Input
            id={`${uid}-headline`}
            value={form.invite_headline}
            maxLength={200}
            onChange={(e) => set("invite_headline", e.target.value)}
            placeholder="e.g. You are warmly invited"
          />
        </Field>
        <Field label="Invitation copy (shown to guests)" htmlFor={`${uid}-desc`}>
          <Textarea
            id={`${uid}-desc`}
            value={form.description}
            rows={3}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Write the warm invitation message guests will read..."
          />
        </Field>
        <Field
          label="Warm invitation message (optional — shown prominently)"
          htmlFor={`${uid}-message`}
        >
          <Textarea
            id={`${uid}-message`}
            value={form.invite_message}
            rows={2}
            onChange={(e) => set("invite_message", e.target.value)}
            placeholder="A short, heartfelt line. Falls back to the copy above if left blank."
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Venue name" htmlFor={`${uid}-venue`}>
            <Input
              id={`${uid}-venue`}
              value={form.venue_name}
              maxLength={200}
              onChange={(e) => set("venue_name", e.target.value)}
              placeholder="e.g. The Grand Ballroom"
            />
          </Field>
          <Field label="Venue address" htmlFor={`${uid}-address`}>
            <Input
              id={`${uid}-address`}
              value={form.venue_address}
              maxLength={400}
              onChange={(e) => set("venue_address", e.target.value)}
              placeholder="Street, city"
            />
          </Field>
          <Field label="Google Maps URL" htmlFor={`${uid}-maps`}>
            <Input
              id={`${uid}-maps`}
              value={form.maps_url}
              maxLength={600}
              onChange={(e) => set("maps_url", e.target.value)}
              placeholder="https://maps.google.com/?q=..."
            />
          </Field>
          <Field label="Contact phone (for WhatsApp)" htmlFor={`${uid}-phone`}>
            <Input
              id={`${uid}-phone`}
              value={form.contact_phone}
              maxLength={50}
              onChange={(e) => set("contact_phone", e.target.value)}
              placeholder="+234..."
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Dress code" htmlFor={`${uid}-dress`}>
            <Textarea
              id={`${uid}-dress`}
              value={form.dress_code}
              rows={2}
              onChange={(e) => set("dress_code", e.target.value)}
            />
          </Field>
          <Field label="Gift details" htmlFor={`${uid}-gifts`}>
            <Textarea
              id={`${uid}-gifts`}
              value={form.gift_details}
              rows={2}
              onChange={(e) => set("gift_details", e.target.value)}
            />
          </Field>
        </div>
        <StepError error={error} />
      </fieldset>
    );
  }
);
