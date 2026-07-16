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

/** Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return formatDateTimeShort(iso);
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

