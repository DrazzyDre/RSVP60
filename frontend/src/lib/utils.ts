import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Date to be announced";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Human-facing labels for each supported event type.
const EVENT_TYPE_LABELS: Record<string, string> = {
  birthday: "Birthday Celebration",
  wedding: "Wedding Celebration",
  funeral: "Funeral Service",
  memorial: "Memorial Service",
  anniversary: "Anniversary Celebration",
  church: "Church Event",
  dinner: "Dinner",
  conference: "Conference",
  other: "Private Event",
};

export function eventTypeLabel(type: string | undefined | null): string {
  return EVENT_TYPE_LABELS[type ?? "other"] ?? "Private Event";
}

// Softer verb used in RSVP copy — a memorial isn't a "celebration".
const SOLEMN_TYPES = new Set(["funeral", "memorial"]);

export function invitationVerb(type: string | undefined | null): string {
  return SOLEMN_TYPES.has(type ?? "")
    ? "We warmly invite you to join us"
    : "We would be honoured by your presence";
}

