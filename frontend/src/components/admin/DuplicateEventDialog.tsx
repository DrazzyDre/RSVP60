"use client";

import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Copy, Info, Loader2, ShieldCheck, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  EventAdmin,
  EventDuplicateRequest,
  EventDuplicateResult,
} from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { eventTypeLabel, formatDate } from "@/lib/utils";

// Reuse the same status → badge palette as the Events portfolio.
const STATUS_BADGE: Record<string, string> = {
  active: "active",
  draft: "paused",
  closed: "exhausted",
  archived: "cancelled",
};

// Mirror the backend field limits so we can fail fast with clear messages.
const NAME_MAX = 200;
const TIME_MAX = 100;

// Value for <input type="datetime-local"> (local time) -> ISO (UTC) string, or
// null when empty. Matches the create/edit flow's semantics exactly so the
// duplicate never introduces a timezone regression.
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

type FormState = {
  name: string;
  event_date: string; // datetime-local (local)
  event_time: string; // free-text display override
  rsvp_deadline: string; // datetime-local (local)
  copy_invite_trees: boolean;
  copy_branding: boolean;
  copy_public_content: boolean;
  copy_rsvp_settings: boolean;
};

function initialForm(source: EventAdmin): FormState {
  return {
    // Sensible, editable prefill. Schedule fields deliberately start empty —
    // they are never inherited from the source event.
    name: `${source.name} — Copy`.slice(0, NAME_MAX),
    event_date: "",
    event_time: "",
    rsvp_deadline: "",
    copy_invite_trees: true,
    copy_branding: true,
    copy_public_content: true,
    copy_rsvp_settings: true,
  };
}

/**
 * Premium "Duplicate event" experience (Phase 8B).
 *
 * Always rendered open — the parent controls the mount lifecycle (mount to
 * open, call `onClose` to unmount). This keeps each invocation's form state
 * fresh and makes focus-return trivial. Renders as a centred modal on desktop
 * and a bottom sheet on mobile, matching the workspace's dialog patterns.
 *
 * On success it refreshes the event context (so the new draft appears without a
 * reload), selects the duplicated event, then routes to its event-scoped
 * settings page — where the URL becomes the source of truth for the workspace.
 */
export function DuplicateEventDialog({
  source,
  onClose,
}: {
  source: EventAdmin;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { refreshEvents, setSelectedEventId } = useEvents();

  const [form, setForm] = useState<FormState>(() => initialForm(source));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Client-side validation mirroring the backend rules. Backend 422s remain
  // authoritative; this just gives immediate, field-level feedback.
  const validationError = useMemo<string | null>(() => {
    const name = form.name.trim();
    if (!name) return "Please enter a name for the new event.";
    if (name.length > NAME_MAX)
      return `The event name must be ${NAME_MAX} characters or fewer.`;
    if (form.event_time.length > TIME_MAX)
      return `The time note must be ${TIME_MAX} characters or fewer.`;
    if (form.event_date && Number.isNaN(new Date(form.event_date).getTime()))
      return "Please enter a valid event date.";
    if (form.rsvp_deadline && Number.isNaN(new Date(form.rsvp_deadline).getTime()))
      return "Please enter a valid RSVP deadline.";
    if (
      form.event_date &&
      form.rsvp_deadline &&
      new Date(form.rsvp_deadline).getTime() > new Date(form.event_date).getTime()
    ) {
      return "The RSVP deadline cannot be after the event date.";
    }
    return null;
  }, [form]);

  // Lock background scroll while the dialog is mounted, and restore focus to
  // whatever opened it on unmount.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Autofocus the name field once the panel has mounted.
    const t = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      const trigger = previouslyFocused.current;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  // Escape closes (unless submitting) and Tab is trapped within the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!submitting) {
          e.stopPropagation();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !panel.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [submitting, onClose]);

  function requestClose() {
    if (!submitting) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // guard against double submit
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: EventDuplicateRequest = {
      name: form.name.trim(),
      event_date: fromLocalInput(form.event_date),
      event_time: form.event_time.trim(),
      rsvp_deadline: fromLocalInput(form.rsvp_deadline),
      copy_invite_trees: form.copy_invite_trees,
      copy_branding: form.copy_branding,
      copy_public_content: form.copy_public_content,
      copy_rsvp_settings: form.copy_rsvp_settings,
    };

    let result: EventDuplicateResult;
    try {
      result = await api.post<EventDuplicateResult>(
        `/api/admin/events/${source.id}/duplicate`,
        payload,
        true
      );
    } catch (err) {
      // Keep the dialog open with all entered values + options so the user can
      // correct and retry. Never surface a raw backend exception.
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not duplicate the event. Please try again."
      );
      setSubmitting(false);
      return;
    }

    const newEvent = result.event;
    // Refresh the shared event list FIRST so the new draft exists in context
    // before we select it and navigate (otherwise the context's validity guard
    // could bounce the selection, or the workspace could read "unavailable").
    try {
      await refreshEvents();
    } catch {
      /* best-effort: the scoped layout will refetch as needed */
    }
    setSelectedEventId(newEvent.id); // select + record as recently opened
    toast.success(successMessage(result));
    onClose();
    // The URL now becomes the source of truth for the new workspace.
    router.push(`/admin/e/${newEvent.id}/settings`);
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 print:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[88vh] sm:max-w-lg sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-royal/10 text-royal">
            <Copy className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-serif text-lg font-bold text-royal">
              Duplicate event
            </h2>
            <p id={descId} className="mt-1 text-sm text-muted-foreground">
              Create a new draft using selected settings from{" "}
              <span className="font-medium text-foreground">“{source.name}”</span>.
              Guest records are never copied.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close"
            className="-mr-1 -mt-0.5 flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          id={`${uid}-form`}
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
        >
          {/* Source summary */}
          <div className="rounded-xl border bg-muted/30 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Duplicating from
            </p>
            <p className="mt-1 truncate font-medium text-foreground" title={source.name}>
              {source.name}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{eventTypeLabel(source.event_type)}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(source.event_date)}</span>
              <span aria-hidden>·</span>
              <span>
                {source.tree_count} invite {source.tree_count === 1 ? "tree" : "trees"}
              </span>
              <Badge status={STATUS_BADGE[source.status] ?? "default"}>
                {source.status}
              </Badge>
            </div>
          </div>

          {/* New event details */}
          <fieldset className="space-y-4" disabled={submitting}>
            <legend className="sr-only">New event details</legend>

            <div className="space-y-2">
              <Label htmlFor={`${uid}-name`}>
                Event name <span className="text-red-500">*</span>
              </Label>
              <Input
                id={`${uid}-name`}
                ref={nameRef}
                value={form.name}
                maxLength={NAME_MAX}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Aunt Ada’s 61st Birthday"
                required
                aria-required="true"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${uid}-date`}>New event date &amp; time</Label>
                <Input
                  id={`${uid}-date`}
                  type="datetime-local"
                  value={form.event_date}
                  onChange={(e) => set("event_date", e.target.value)}
                  aria-describedby={`${uid}-date-hint`}
                />
                <p id={`${uid}-date-hint`} className="text-xs text-muted-foreground">
                  Not copied from the original event.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${uid}-time`}>Time note (optional)</Label>
                <Input
                  id={`${uid}-time`}
                  value={form.event_time}
                  maxLength={TIME_MAX}
                  onChange={(e) => set("event_time", e.target.value)}
                  placeholder="e.g. 2:00 PM"
                  aria-describedby={`${uid}-time-hint`}
                />
                <p id={`${uid}-time-hint`} className="text-xs text-muted-foreground">
                  Schedule details are not inherited from the original event.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${uid}-deadline`}>New RSVP deadline (optional)</Label>
              <Input
                id={`${uid}-deadline`}
                type="datetime-local"
                value={form.rsvp_deadline}
                onChange={(e) => set("rsvp_deadline", e.target.value)}
                aria-describedby={`${uid}-deadline-hint`}
              />
              <p id={`${uid}-deadline-hint`} className="text-xs text-muted-foreground">
                The original deadline is not copied. If set, it must not be after
                the event date.
              </p>
            </div>
          </fieldset>

          {/* Copy options */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-royal" aria-hidden />
              <h3 className="text-sm font-semibold text-royal">What to copy</h3>
            </div>
            <div className="space-y-2.5">
              <CopyOption
                id={`${uid}-opt-trees`}
                checked={form.copy_invite_trees}
                onChange={(v) => set("copy_invite_trees", v)}
                disabled={submitting}
                label="Invite trees and allocations"
                description="Copies tree names, seat allocations and plus-one rules. Guest responses and used seats are never copied."
              />
              <CopyOption
                id={`${uid}-opt-branding`}
                checked={form.copy_branding}
                onChange={(v) => set("copy_branding", v)}
                disabled={submitting}
                label="Theme and branding"
                description="Copies the event theme and visual settings. The flyer image must be uploaded again."
              />
              <CopyOption
                id={`${uid}-opt-content`}
                checked={form.copy_public_content}
                onChange={(v) => set("copy_public_content", v)}
                disabled={submitting}
                label="Invitation content"
                description="Copies the headline, message, venue, dress code, gift details and public contact information."
              />
              <CopyOption
                id={`${uid}-opt-rsvp`}
                checked={form.copy_rsvp_settings}
                onChange={(v) => set("copy_rsvp_settings", v)}
                disabled={submitting}
                label="RSVP and communication settings"
                description="Copies event-level RSVP configuration and host notification settings. No guest contact or consent data is copied."
              />
            </div>
          </div>

          {/* Permanent privacy / reset notice */}
          <div className="rounded-xl border border-royal/15 bg-royal/[0.04] p-3.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-royal" aria-hidden />
              <p className="text-sm font-semibold text-royal">Always starts fresh</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              The duplicated event will be created as a Draft. Guests, RSVPs,
              waitlist entries, check-ins, communication history, notifications and
              audit history will not be copied.
            </p>
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-royal" aria-hidden />
              The flyer image is not copied and must be uploaded again.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t bg-white px-5 py-3.5">
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form={`${uid}-form`} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Creating duplicate…" : "Duplicate event"}
          </Button>
          {/* Polite status region so the loading state is announced. */}
          <span className="sr-only" role="status" aria-live="polite">
            {submitting ? "Creating duplicate event, please wait." : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// Singular/plural-correct success line built from the response fields. The flyer
// is always mentioned because it is never copied for this version.
function successMessage(result: EventDuplicateResult): string {
  const n = result.invite_trees_copied;
  const treePart =
    n === 0
      ? "No invite trees were copied."
      : n === 1
        ? "It has 1 invite tree."
        : `It has ${n} invite trees.`;
  return (
    `“${result.event.name}” was created as a draft. ${treePart} ` +
    "Upload a new flyer and review the setup before activating it."
  );
}

function CopyOption({
  id,
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 transition-colors hover:border-royal/40 hover:bg-royal/[0.02]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-desc`}
        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-royal"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span id={`${id}-desc`} className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}
