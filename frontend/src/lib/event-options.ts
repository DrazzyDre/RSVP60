// Shared option lists for event forms (create/edit form + guided setup wizard).
// Single-sourced so the create form and the wizard can never present different
// choices for the same backend field.

import type { BackgroundPreset, EventType } from "@/lib/types";

export const EVENT_TYPES: EventType[] = [
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

export const BACKGROUND_PRESETS: { value: BackgroundPreset; label: string }[] = [
  { value: "", label: "Theme default" },
  { value: "soft", label: "Soft glow" },
  { value: "plain", label: "Plain" },
  { value: "festive", label: "Festive" },
];

// Plus-one options for invite trees (seats = 1 + max_extra_guests).
export const PLUS_ONE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "No plus-one (1 seat)" },
  { value: 1, label: "+1 allowed (2 seats)" },
  { value: 2, label: "+2 allowed (3 seats)" },
];
