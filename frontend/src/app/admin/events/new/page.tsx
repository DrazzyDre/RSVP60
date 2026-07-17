"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { fromLocalInput } from "@/lib/datetime";
import { EVENT_TYPES } from "@/lib/event-options";
import type { EventAdmin, EventType } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { SetupProgress } from "@/components/admin/setup/SetupProgress";
import type { SetupStepKey } from "@/components/admin/setup/steps";
import { Field } from "@/components/admin/setup/step-utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// Before the event exists, no step is complete and only "details" is reachable.
const NONE_COMPLETE: Record<SetupStepKey, boolean> = {
  details: false,
  invitation: false,
  rsvp: false,
  branding: false,
  trees: false,
  review: false,
};

/**
 * Wizard step 1 (create). Persists a Draft only after valid minimum details are
 * submitted, then continues into the event-scoped guided setup. Keeps the
 * canonical /admin/events/new entry so every "Create event" link still works.
 */
export default function NewEventPage() {
  const router = useRouter();
  const canEdit = useCanEdit();
  const { refreshEvents, setSelectedEventId } = useEvents();
  const toast = useToast();

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EventType>("birthday");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [host, setHost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // guard double submit
    if (!name.trim()) {
      setError("Please enter an event name.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const created = await api.post<EventAdmin>(
        "/api/admin/events",
        {
          name: name.trim(),
          event_type: eventType,
          event_date: fromLocalInput(eventDate),
          event_time: eventTime,
          host_or_celebrant_name: host,
        },
        true
      );
      // Adopt the new draft as the selected workspace, then continue guided setup.
      await refreshEvents();
      setSelectedEventId(created.id);
      toast.success(`“${created.name}” created as a draft — let’s finish the setup.`);
      router.push(`/admin/e/${created.id}/setup?step=invitation`);
    } catch (err) {
      // Preserve entered values so the host can correct and retry.
      setError(err instanceof ApiError ? err.message : "Could not create the event.");
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-12 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium text-foreground">You can view events only</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Creating events requires an owner or admin account. Ask an owner if you
            need access.
          </p>
          <Link href="/admin/events" className="mt-5 inline-block">
            <Button variant="outline">Back to events</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/admin" className="hover:text-royal hover:underline">
              Dashboard
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <li>
            <Link href="/admin/events" className="hover:text-royal hover:underline">
              Events
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <li aria-current="page" className="font-medium text-foreground">
            New event
          </li>
        </ol>
      </nav>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          Guided setup
        </p>
        <h1 className="font-serif text-2xl font-bold text-royal">Create your event</h1>
        <p className="text-sm text-muted-foreground">
          Start with the essentials. Your event is created as a private draft, then
          we’ll guide you through the invitation, RSVP, branding and invite trees.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 sm:p-5">
        <SetupProgress currentKey="details" completion={NONE_COMPLETE} navigable={() => false} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Event name" htmlFor="new-name" required>
                <Input
                  id="new-name"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dad's 60th Birthday"
                  required
                  autoFocus
                />
              </Field>
              <Field label="Event type" htmlFor="new-type">
                <Select
                  id="new-type"
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
                htmlFor="new-date"
                hint="You can refine this later — it isn’t required to create the draft."
              >
                <Input
                  id="new-date"
                  type="datetime-local"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </Field>
              <Field label="Time note (optional)" htmlFor="new-time">
                <Input
                  id="new-time"
                  value={eventTime}
                  maxLength={100}
                  onChange={(e) => setEventTime(e.target.value)}
                  placeholder="e.g. 5:00 PM prompt"
                />
              </Field>
            </div>
            <Field label="Host / celebrant name" htmlFor="new-host">
              <Input
                id="new-host"
                value={host}
                maxLength={200}
                onChange={(e) => setHost(e.target.value)}
                placeholder="e.g. Chief Emmanuel Adeyemi"
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {saving ? "Creating…" : "Create draft & continue"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/events")}
              >
                Cancel
              </Button>
              <span className="text-xs text-muted-foreground">
                <span className="text-red-500">*</span> Only the name is required to
                start.
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
