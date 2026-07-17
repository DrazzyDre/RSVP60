"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { api, ApiError, resolveMediaUrl } from "@/lib/api";
import { useUnsavedChanges } from "@/lib/hooks";
import { fromLocalInput, toLocalInput } from "@/lib/datetime";
import {
  BACKGROUND_PRESETS,
  EVENT_TYPES,
  THEME_PRESETS,
} from "@/lib/event-options";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import type {
  BackgroundPreset,
  EventAdmin,
  EventType,
  EventStatus,
  ThemePreset,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const STATUSES: EventStatus[] = ["draft", "active", "closed", "archived"];

// Client-side mirror of the backend flyer rules (app/storage.py + config).
const FLYER_ACCEPT = "image/jpeg,image/png,image/webp";
const FLYER_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Metadata passed back to the parent after a create, so it can warn when the
// event was created but its flyer could not be uploaded (without duplicating it).
export type EventSaveMeta = {
  flyerUploadFailed?: boolean;
  flyerUploadError?: string;
};

// Validate a picked flyer the same way the backend will, so we fail fast with a
// clear message instead of a round-trip. Returns an error string, or null if OK.
function validateFlyer(file: File): string | null {
  const type = file.type.toLowerCase();
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(type)) {
    return "Unsupported image type. Please choose a JPG, PNG or WebP image.";
  }
  if (file.size > FLYER_MAX_BYTES) {
    return "Image is too large. The maximum size is 5 MB.";
  }
  return null;
}

type FormState = {
  name: string;
  event_type: EventType;
  host_or_celebrant_name: string;
  title: string;
  invite_headline: string;
  invite_message: string;
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
  auto_close_rsvp: boolean;
  theme_preset: ThemePreset;
  accent_color: string;
  background_preset: BackgroundPreset;
  status: EventStatus;
  host_notification_email: string;
  notify_tree_exhausted: boolean;
  notify_waitlisted_rsvp: boolean;
};

function initial(event?: EventAdmin | null): FormState {
  return {
    name: event?.name ?? "",
    event_type: event?.event_type ?? "birthday",
    host_or_celebrant_name: event?.host_or_celebrant_name ?? "",
    title: event?.title ?? "",
    invite_headline: event?.invite_headline ?? "",
    invite_message: event?.invite_message ?? "",
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
    auto_close_rsvp: event?.auto_close_rsvp ?? true,
    theme_preset: event?.theme_preset ?? "elegant",
    accent_color: event?.accent_color ?? "",
    background_preset: event?.background_preset ?? "",
    status: initialStatus(event),
    host_notification_email: event?.host_notification_email ?? "",
    notify_tree_exhausted: event?.notify_tree_exhausted ?? true,
    notify_waitlisted_rsvp: event?.notify_waitlisted_rsvp ?? false,
  };
}

// New events default to "draft" (set up first, then go live); editing keeps the
// event's real status. A draft event does not accept public RSVPs yet.
function initialStatus(event?: EventAdmin | null): EventStatus {
  return event?.status ?? "draft";
}

export function EventForm({
  event,
  onSaved,
  onCancel,
}: {
  event?: EventAdmin | null;
  onSaved: (e: EventAdmin, meta?: EventSaveMeta) => void;
  onCancel: () => void;
}) {
  const confirm = useConfirm();
  const initialRef = useRef<FormState>(initial(event));
  const [form, setForm] = useState<FormState>(initialRef.current);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create mode only: a flyer selected up-front and uploaded automatically right
  // after the event is created (once it has an id). Held in memory until submit.
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null);
  const [flyerError, setFlyerError] = useState<string | null>(null);

  // Revoke the object-URL preview when the file changes / on unmount.
  useEffect(() => {
    if (!flyerFile) {
      setFlyerPreview(null);
      return;
    }
    const url = URL.createObjectURL(flyerFile);
    setFlyerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [flyerFile]);

  function pickFlyer(file: File | null) {
    setFlyerError(null);
    if (!file) {
      setFlyerFile(null);
      return;
    }
    const err = validateFlyer(file);
    if (err) {
      setFlyerError(err);
      return;
    }
    setFlyerFile(file);
  }

  // Warn on tab close / reload while there are meaningful unsaved edits (but not
  // after a successful save, which navigates away intentionally).
  const dirty =
    !saved && JSON.stringify(form) !== JSON.stringify(initialRef.current);
  useUnsavedChanges(dirty);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // guard against double-submit
    setError(null);
    setSaving(true);
    const payload = {
      ...form,
      event_date: fromLocalInput(form.event_date),
      rsvp_deadline: fromLocalInput(form.rsvp_deadline),
    };

    // --- Edit: single PATCH, unchanged behaviour. ------------------------
    if (event) {
      try {
        const savedEvent = await api.patch<EventAdmin>(
          `/api/admin/events/${event.id}`,
          payload
        );
        setSaved(true); // disables the unsaved-changes guard before navigating
        onSaved(savedEvent);
      } catch (err) {
        // Entered values are preserved so the user can correct and retry.
        setError(err instanceof ApiError ? err.message : "Could not save event.");
      } finally {
        setSaving(false);
      }
      return;
    }

    // --- Create: create the event first, then upload the flyer (if any). --
    // The two-step nature is invisible to the user — it feels like one action.
    let created: EventAdmin;
    try {
      created = await api.post<EventAdmin>("/api/admin/events", payload, true);
    } catch (err) {
      // Creation failed: never attempt the flyer upload; keep the entered
      // details and the selected file so the user can fix and retry.
      setError(err instanceof ApiError ? err.message : "Could not save event.");
      setSaving(false);
      return;
    }

    // Event exists now — disable the unsaved-changes guard before navigating.
    setSaved(true);
    if (!flyerFile) {
      setSaving(false);
      onSaved(created);
      return;
    }

    try {
      const fd = new FormData();
      fd.append("file", flyerFile);
      const withFlyer = await api.upload<EventAdmin>(
        `/api/admin/events/${created.id}/flyer`,
        fd
      );
      setSaving(false);
      onSaved(withFlyer);
    } catch (err) {
      // The event was created successfully — do NOT recreate it. Hand it back
      // with a flyer-failure flag so the parent keeps it, selects it, and warns
      // with a retry path (retrying uploads to this same event, no duplicate).
      const msg =
        err instanceof ApiError ? err.message : "The flyer could not be uploaded.";
      setSaving(false);
      onSaved(created, { flyerUploadFailed: true, flyerUploadError: msg });
    }
  }

  async function handleCancel() {
    if (
      dirty &&
      !(await confirm({
        title: "Discard your changes?",
        description: "This event form has unsaved changes that will be lost.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      }))
    ) {
      return;
    }
    onCancel();
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

      <Field label="Invite headline (short banner line)">
        <Input
          value={form.invite_headline}
          onChange={(e) => set("invite_headline", e.target.value)}
          placeholder="e.g. You are warmly invited"
        />
      </Field>

      <Field label="Invitation copy (shown to guests)">
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          placeholder="Write the warm invitation message guests will read..."
        />
      </Field>

      <Field label="Warm invitation message (optional — shown prominently)">
        <Textarea
          value={form.invite_message}
          onChange={(e) => set("invite_message", e.target.value)}
          rows={2}
          placeholder="A short, heartfelt line. Falls back to the copy above if left blank."
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

      {/* Flyer / event image */}
      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <Label className="text-sm font-semibold text-royal">Event flyer / image</Label>
        {event ? (
          <FlyerUpload event={event} />
        ) : (
          <PendingFlyerPicker
            preview={flyerPreview}
            fileName={flyerFile?.name ?? null}
            error={flyerError}
            onSelect={pickFlyer}
          />
        )}
        <Field label="Or paste an external image URL (used if no file is uploaded)">
          <Input
            value={form.flyer_url}
            onChange={(e) => set("flyer_url", e.target.value)}
            placeholder="https://..."
          />
        </Field>
      </div>

      {/* Invite theme */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Theme preset">
          <Select
            value={form.theme_preset}
            onChange={(e) => set("theme_preset", e.target.value as ThemePreset)}
          >
            {THEME_PRESETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Background style">
          <Select
            value={form.background_preset}
            onChange={(e) =>
              set("background_preset", e.target.value as BackgroundPreset)
            }
          >
            {BACKGROUND_PRESETS.map((b) => (
              <option key={b.value || "default"} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Accent colour (optional)">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Accent colour"
              value={form.accent_color || "#1E2A6B"}
              onChange={(e) => set("accent_color", e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-lg border border-input bg-white p-1"
            />
            {form.accent_color ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set("accent_color", "")}
              >
                Reset
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Theme default</span>
            )}
          </div>
        </Field>
      </div>

      {/* Deadline + status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="RSVP deadline">
          <Input
            type="datetime-local"
            value={form.rsvp_deadline}
            onChange={(e) => set("rsvp_deadline", e.target.value)}
          />
        </Field>
        <Field label="After the deadline">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-input bg-white px-3 text-sm">
            <input
              type="checkbox"
              checked={form.auto_close_rsvp}
              onChange={(e) => set("auto_close_rsvp", e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-royal"
            />
            Close RSVPs automatically
          </label>
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

      {/* Host email alerts */}
      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <Label className="text-sm font-semibold text-royal">Host email alerts</Label>
        <p className="text-xs text-muted-foreground">
          Optional. When set, the host is emailed about key moments. Leave the
          address blank to disable host alerts for this event.
        </p>
        <Field label="Host notification email">
          <Input
            type="email"
            value={form.host_notification_email}
            onChange={(e) => set("host_notification_email", e.target.value)}
            placeholder="host@example.com"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.notify_tree_exhausted}
            onChange={(e) => set("notify_tree_exhausted", e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-royal"
          />
          Alert when an invite allocation becomes full
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.notify_waitlisted_rsvp}
            onChange={(e) => set("notify_waitlisted_rsvp", e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-royal"
          />
          Alert when a guest is waitlisted because capacity is full
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving
            ? event
              ? "Saving…"
              : "Creating…"
            : event
              ? "Save changes"
              : "Create event"}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          <span className="text-red-500">*</span> Required. Optional details
          (flyer, gifts, dress code) can be added later.
        </span>
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

// Create-mode flyer chooser: selects a file and previews it locally. Nothing is
// uploaded until the event is created (EventForm handles the upload afterwards).
function PendingFlyerPicker({
  preview,
  fileName,
  error,
  onSelect,
}: {
  preview: string | null;
  fileName: string | null;
  error: string | null;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="relative overflow-hidden rounded-lg border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Selected flyer preview"
            className="max-h-64 w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-white text-muted-foreground">
          <ImagePlus className="mr-2 h-5 w-5" /> No flyer selected yet
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={FLYER_ACCEPT}
        onChange={(e) => {
          onSelect(e.target.files?.[0] ?? null);
          if (inputRef.current) inputRef.current.value = "";
        }}
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud className="h-4 w-4" />
          {fileName ? "Choose a different image" : "Choose flyer image"}
        </Button>
        {fileName && (
          <>
            <span className="truncate text-xs text-muted-foreground" title={fileName}>
              {fileName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelect(null)}
            >
              <X className="h-4 w-4" /> Clear
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        JPG, PNG or WebP · up to 5&nbsp;MB. It uploads automatically when you
        create the event. Uploaded images take priority over the URL below.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Upload / preview / replace / remove the event flyer image.
export function FlyerUpload({ event }: { event: EventAdmin }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [imageUrl, setImageUrl] = useState(event.flyer_image_url);
  const [storagePath, setStoragePath] = useState(event.flyer_storage_path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = resolveMediaUrl(imageUrl);
  const hasUpload = Boolean(storagePath);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const updated = await api.upload<EventAdmin>(
        `/api/admin/events/${event.id}/flyer`,
        fd
      );
      setImageUrl(updated.flyer_image_url);
      setStoragePath(updated.flyer_storage_path);
      toast.success("Flyer uploaded.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onRemove() {
    const ok = await confirm({
      title: "Remove this flyer?",
      description:
        "The flyer image will be removed from the event and the public invite. You can upload a new one later.",
      confirmLabel: "Remove flyer",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await api.del<EventAdmin>(
        `/api/admin/events/${event.id}/flyer`
      );
      setImageUrl(updated.flyer_image_url);
      setStoragePath(updated.flyer_storage_path);
      toast.success("Flyer removed.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not remove flyer.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {preview ? (
        <div className="relative overflow-hidden rounded-lg border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Event flyer preview"
            className="max-h-64 w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed bg-white text-muted-foreground">
          <ImagePlus className="mr-2 h-5 w-5" /> No flyer uploaded yet
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFile}
        className="hidden"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          {hasUpload ? "Replace flyer" : "Upload flyer"}
        </Button>
        {hasUpload && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        JPG, PNG or WebP · up to 5&nbsp;MB. Uploaded images take priority over the
        URL below.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
