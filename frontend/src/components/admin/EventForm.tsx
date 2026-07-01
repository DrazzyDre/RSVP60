"use client";

import * as React from "react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { EventAdmin, EventType, EventStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const EVENT_TYPES: EventType[] = [
  "birthday",
  "wedding",
  "funeral",
  "memorial",
  "anniversary",
  "church",
  "dinner",
  "conference",
  "other",
];

const STATUSES: EventStatus[] = ["draft", "active", "closed", "archived"];

// ISO (UTC) -> value for <input type="datetime-local"> in local time.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

type FormState = {
  name: string;
  event_type: EventType;
  host_or_celebrant_name: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  venue_name: string;
  venue_address: string;
  maps_url: string;
  dress_code: string;
  gift_details: string;
  contact_phone: string;
  flyer_url: string;
  rsvp_deadline: string;
  status: EventStatus;
};

function initial(event?: EventAdmin | null): FormState {
  return {
    name: event?.name ?? "",
    event_type: event?.event_type ?? "birthday",
    host_or_celebrant_name: event?.host_or_celebrant_name ?? "",
    title: event?.title ?? "",
    description: event?.description ?? "",
    event_date: toLocalInput(event?.event_date ?? null),
    event_time: event?.event_time ?? "",
    venue_name: event?.venue_name ?? "",
    venue_address: event?.venue_address ?? "",
    maps_url: event?.maps_url ?? "",
    dress_code: event?.dress_code ?? "",
    gift_details: event?.gift_details ?? "",
    contact_phone: event?.contact_phone ?? "",
    flyer_url: event?.flyer_url ?? "",
    rsvp_deadline: toLocalInput(event?.rsvp_deadline ?? null),
    status: event?.status ?? "active",
  };
}

export function EventForm({
  event,
  onSaved,
  onCancel,
}: {
  event?: EventAdmin | null;
  onSaved: (e: EventAdmin) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial(event));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      ...form,
      event_date: fromLocalInput(form.event_date),
      rsvp_deadline: fromLocalInput(form.rsvp_deadline),
    };
    try {
      const saved = event
        ? await api.patch<EventAdmin>(`/api/admin/events/${event.id}`, payload)
        : await api.post<EventAdmin>("/api/admin/events", payload, true);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Event name" required>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Dad's 60th Birthday"
            required
          />
        </Field>
        <Field label="Event type">
          <Select
            value={form.event_type}
            onChange={(e) => set("event_type", e.target.value as EventType)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Host / celebrant name">
          <Input
            value={form.host_or_celebrant_name}
            onChange={(e) => set("host_or_celebrant_name", e.target.value)}
            placeholder="e.g. Chief Emmanuel Adeyemi"
          />
        </Field>
        <Field label="Invite title / tagline">
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. A Diamond Celebration at 60"
          />
        </Field>
      </div>

      <Field label="Invitation copy (shown to guests)">
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          placeholder="Write the warm invitation message guests will read..."
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Event date & time">
          <Input
            type="datetime-local"
            value={form.event_date}
            onChange={(e) => set("event_date", e.target.value)}
          />
        </Field>
        <Field label="Time note (optional display override)">
          <Input
            value={form.event_time}
            onChange={(e) => set("event_time", e.target.value)}
            placeholder="e.g. 5:00 PM prompt"
          />
        </Field>
        <Field label="Venue name">
          <Input
            value={form.venue_name}
            onChange={(e) => set("venue_name", e.target.value)}
            placeholder="e.g. The Grand Ballroom"
          />
        </Field>
        <Field label="Venue address">
          <Input
            value={form.venue_address}
            onChange={(e) => set("venue_address", e.target.value)}
            placeholder="Street, city"
          />
        </Field>
        <Field label="Google Maps URL">
          <Input
            value={form.maps_url}
            onChange={(e) => set("maps_url", e.target.value)}
            placeholder="https://maps.google.com/?q=..."
          />
        </Field>
        <Field label="Contact phone (for WhatsApp)">
          <Input
            value={form.contact_phone}
            onChange={(e) => set("contact_phone", e.target.value)}
            placeholder="+234..."
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Dress code">
          <Textarea
            value={form.dress_code}
            onChange={(e) => set("dress_code", e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Gift details">
          <Textarea
            value={form.gift_details}
            onChange={(e) => set("gift_details", e.target.value)}
            rows={2}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Flyer image URL">
          <Input
            value={form.flyer_url}
            onChange={(e) => set("flyer_url", e.target.value)}
            placeholder="https://..."
          />
        </Field>
        <Field label="RSVP deadline">
          <Input
            type="datetime-local"
            value={form.rsvp_deadline}
            onChange={(e) => set("rsvp_deadline", e.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => set("status", e.target.value as EventStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {event ? "Save changes" : "Create event"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
