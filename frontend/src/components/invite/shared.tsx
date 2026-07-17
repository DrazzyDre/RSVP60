"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  MessageCircle,
  Navigation,
} from "lucide-react";
import type { EventPublic, InvitePublic } from "@/lib/types";
import type { InviteTheme } from "@/lib/theme";
import { downloadICS, googleCalendarUrl } from "@/lib/calendar";
import { cn, formatDate } from "@/lib/utils";
import { RsvpForm } from "@/components/invite/RsvpForm";
import { Button } from "@/components/ui/button";

/**
 * Shared, logic-bearing building blocks used by every invitation template.
 * Business behaviour (RSVP submission, availability branching, calendar/ICS,
 * WhatsApp, flyer loading/fallback) lives here ONCE; templates compose these.
 */

// --- Flyer state (single source of load/failure truth) -------------------- //
/**
 * The lifecycle of a flyer image, shared by every template so none of them has
 * to independently guess whether the image loaded:
 *  - `missing` — no URL at all
 *  - `loading` — a URL is present and being fetched
 *  - `loaded`  — the image decoded successfully
 *  - `failed`  — the URL is unavailable / 404 / 403 / undecodable
 */
export type FlyerRenderState = "missing" | "loading" | "loaded" | "failed";

/**
 * Resolve a flyer URL to a render state exactly once (no repeated retries of a
 * permanently broken image). Preloads via `new Image()` so we only mount a real
 * `<img>` after a successful decode — a failed URL never renders a broken-image
 * shell. Re-runs when the URL changes, so a previous event's failure can never
 * bleed into the next event's valid flyer.
 */
export function useFlyerState(url: string | null | undefined): FlyerRenderState {
  const [state, setState] = useState<FlyerRenderState>(url ? "loading" : "missing");

  useEffect(() => {
    if (!url) {
      setState("missing");
      return;
    }
    setState("loading");
    let active = true;
    const img = new window.Image();
    img.onload = () => {
      if (active) setState("loaded");
    };
    img.onerror = () => {
      if (active) setState("failed");
    };
    img.src = url;
    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  return state;
}

// A restrained, reduced-motion-aware placeholder shown only while a valid flyer
// is still loading (never after a failure).
export function FlyerSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "aspect-[4/3] w-full bg-muted motion-safe:animate-pulse",
        className
      )}
    />
  );
}

// --- Flyer (hero variant) ------------------------------------------------- //
/**
 * Self-contained flyer for templates with a designed no-flyer HERO. Always
 * renders inside its frame: a skeleton while loading, the image once loaded, or
 * the caller's `fallback` hero when the flyer is missing OR failed — so a broken
 * URL is indistinguishable from a no-flyer event.
 */
export function Flyer({
  url,
  alt,
  fallback,
  className,
  imgClassName,
}: {
  url: string;
  alt: string;
  fallback: React.ReactNode;
  className?: string;
  imgClassName?: string;
}) {
  const state = useFlyerState(url);
  let content: React.ReactNode;
  if (state === "loaded") {
    content = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={cn("block h-auto w-full object-cover", imgClassName)}
      />
    );
  } else if (state === "loading") {
    content = <FlyerSkeleton />;
  } else {
    // missing | failed → the template's intentional no-flyer composition.
    content = fallback;
  }
  return <div className={className}>{content}</div>;
}

// --- FlyerImage (inset variant) ------------------------------------------- //
/**
 * Presentational flyer for templates WITHOUT a hero fallback (Classic, Minimal,
 * Formal). Renders the loaded image or a loading skeleton; returns `null` when
 * missing/failed. Those templates read {@link useFlyerState} themselves and omit
 * the surrounding frame entirely for missing/failed, so no empty box remains.
 */
export function FlyerImage({
  state,
  url,
  alt,
  imgClassName,
}: {
  state: FlyerRenderState;
  url: string;
  alt: string;
  imgClassName?: string;
}) {
  if (state === "loading") return <FlyerSkeleton />;
  if (state === "loaded") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={cn("block h-auto w-full object-cover", imgClassName)}
      />
    );
  }
  return null;
}

// --- Calendar actions ----------------------------------------------------- //
export function CalendarActions({
  event,
  className,
}: {
  event: EventPublic;
  className?: string;
}) {
  if (!event.event_date) return null;
  const gcal = googleCalendarUrl(event);
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
      <Button variant="secondary" className="flex-1" onClick={() => downloadICS(event)}>
        <CalendarPlus className="h-4 w-4" />
        Add to calendar (.ics)
      </Button>
      {gcal && (
        <a href={gcal} target="_blank" rel="noopener noreferrer" className="flex-1">
          <Button variant="outline" className="w-full">
            <CalendarDays className="h-4 w-4" />
            Google Calendar
          </Button>
        </a>
      )}
    </div>
  );
}

// --- Directions ----------------------------------------------------------- //
export function DirectionsButton({
  mapsUrl,
  className,
}: {
  mapsUrl: string;
  className?: string;
}) {
  if (!mapsUrl) return null;
  return (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={className}>
      <Button variant="outline" size="sm">
        <Navigation className="h-4 w-4" />
        Get directions
      </Button>
    </a>
  );
}

// --- Contact host (WhatsApp) ---------------------------------------------- //
export function ContactHostButton({
  phone,
  theme,
  className,
}: {
  phone: string;
  theme: InviteTheme;
  className?: string;
}) {
  if (!phone) return null;
  const number = phone.replace(/[^\d]/g, "");
  if (!number) return null;
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <Button variant="ghost" style={{ color: theme.accentStrong }}>
        <MessageCircle className="h-4 w-4" />
        Questions? Message the host
      </Button>
    </a>
  );
}

// --- RSVP deadline line --------------------------------------------------- //
export function RsvpDeadlineLine({
  event,
  invite,
  className,
}: {
  event: EventPublic;
  invite: InvitePublic;
  className?: string;
}) {
  if (!event.rsvp_deadline || !invite.accepting_rsvps) return null;
  return (
    <p className={cn("text-xs font-medium text-muted-foreground", className)}>
      Please RSVP by {formatDate(event.rsvp_deadline)}
    </p>
  );
}

// --- RSVP section (form / closed / preview) ------------------------------- //
/**
 * The single place that decides which RSVP state to show. Templates render this
 * inside their own framing but never re-implement the branching or the form.
 */
export function RsvpSection({
  token,
  invite,
  onSubmitted,
  theme,
  preview,
}: {
  token: string;
  invite: InvitePublic;
  onSubmitted: () => void;
  theme: InviteTheme;
  preview?: boolean;
}) {
  if (preview) return <RsvpPreviewPlaceholder theme={theme} />;
  if (invite.accepting_rsvps) {
    return <RsvpForm token={token} invite={invite} onSubmitted={onSubmitted} />;
  }
  return (
    <div className="rounded-lg bg-muted px-4 py-6 text-center">
      <p className="font-medium text-foreground">
        RSVPs for this invitation are currently closed.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Please reach out to the host if you have any questions.
      </p>
    </div>
  );
}

// A static, non-interactive mock of the RSVP form for the admin preview.
function RsvpPreviewPlaceholder({ theme }: { theme: InviteTheme }) {
  return (
    <div className="pointer-events-none select-none space-y-4" aria-hidden>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className="rounded-lg border-2 px-4 py-3 text-center text-sm font-medium text-white"
          style={{ background: theme.accentStrong, borderColor: theme.accentStrong }}
        >
          Yes, I will attend
        </div>
        <div className="rounded-lg border-2 border-input px-4 py-3 text-center text-sm font-medium text-muted-foreground">
          Sorry, I can&apos;t make it
        </div>
      </div>
      <div className="h-11 rounded-lg border border-input bg-white" />
      <div className="h-11 rounded-lg border border-input bg-white" />
      <div
        className="rounded-lg px-4 py-3 text-center text-sm font-semibold text-white"
        style={{ background: theme.accentStrong }}
      >
        Send my RSVP
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Guests complete this form on the live invitation.
      </p>
    </div>
  );
}
