"use client";

import * as React from "react";
import type { InvitationTemplateProps } from "@/components/invite/template-types";
import { getInviteTheme } from "@/lib/theme";
import { eventTypeLabel, formatDate, formatTime } from "@/lib/utils";
import {
  CalendarActions,
  ContactHostButton,
  DirectionsButton,
  FlyerImage,
  RsvpDeadlineLine,
  RsvpSection,
  useFlyerState,
} from "@/components/invite/shared";

/**
 * Formal — dignified and structured, with a strong centred date/location
 * hierarchy and minimal celebratory decoration. Appropriate for memorials,
 * church services, conferences and ceremonies — solemn-friendly without
 * feeling gloomy.
 */
export function FormalRender({
  event,
  invite,
  token,
  theme,
  flyerUrl,
  submitted,
  onSubmitted,
  preview,
}: InvitationTemplateProps) {
  const message = event.invite_message || event.description;
  const displayName = event.host_or_celebrant_name || event.name;
  const typeLabel = eventTypeLabel(event.event_type);
  const flyerState = useFlyerState(flyerUrl);
  const showFlyer = flyerState === "loading" || flyerState === "loaded";

  return (
    <div className="mx-auto max-w-xl px-4 pt-10">
      {/* Masthead framed by rules */}
      <header className="motion-safe:animate-fade-up text-center">
        <div className="mx-auto h-0.5 w-16" style={{ background: theme.accentStrong }} aria-hidden />
        <p
          className="mt-5 text-[11px] font-semibold uppercase tracking-[0.4em]"
          style={{ color: theme.eyebrow }}
        >
          {event.invite_headline || typeLabel}
        </p>
        <h1
          className="mt-4 font-serif text-3xl font-semibold leading-tight sm:text-4xl"
          style={{ color: theme.accentStrong }}
        >
          {displayName}
        </h1>
        {event.title && <p className="mt-2 text-base text-muted-foreground">{event.title}</p>}
      </header>

      {/* Flyer (simple framed) — omitted entirely when missing or failed. */}
      {showFlyer && (
        <div className="motion-safe:animate-fade-up mt-8 overflow-hidden rounded-lg border">
          <FlyerImage
            state={flyerState}
            url={flyerUrl}
            alt={`${displayName} announcement`}
          />
        </div>
      )}

      {/* Strong date / location block */}
      <section
        className="motion-safe:animate-fade-up mt-8 border-y py-6 text-center"
        style={{ borderColor: theme.iconBg }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Date
        </p>
        <p className="mt-1 font-serif text-2xl font-semibold" style={{ color: theme.accentStrong }}>
          {formatDate(event.event_date)}
        </p>
        {(event.event_time || event.event_date) && (
          <p className="mt-1 text-sm text-muted-foreground">
            {event.event_time || formatTime(event.event_date)}
          </p>
        )}
        {event.venue_name && (
          <>
            <div
              className="mx-auto my-4 h-px w-24"
              style={{ background: theme.divider }}
              aria-hidden
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Location
            </p>
            <p className="mt-1 font-medium text-foreground">{event.venue_name}</p>
            {event.venue_address && (
              <p className="text-sm text-muted-foreground">{event.venue_address}</p>
            )}
            <DirectionsButton mapsUrl={event.maps_url} className="mt-3 inline-block" />
          </>
        )}
      </section>

      {message && (
        <p className="motion-safe:animate-fade-up mx-auto mt-6 max-w-md text-center leading-relaxed text-foreground/80">
          {message}
        </p>
      )}

      {(event.dress_code || event.gift_details) && (
        <section className="motion-safe:animate-fade-up mt-6 space-y-2 text-center text-sm text-muted-foreground">
          {event.dress_code && (
            <p>
              <span className="font-semibold uppercase tracking-wide" style={{ color: theme.accentStrong }}>
                Attire:
              </span>{" "}
              {event.dress_code}
            </p>
          )}
          {event.gift_details && (
            <p>
              <span className="font-semibold uppercase tracking-wide" style={{ color: theme.accentStrong }}>
                Gifts:
              </span>{" "}
              {event.gift_details}
            </p>
          )}
        </section>
      )}

      <CalendarActions event={event} className="mt-6" />

      {/* RSVP */}
      <section
        id="rsvp"
        className="motion-safe:animate-fade-up mt-10 rounded-lg border bg-white p-6 sm:p-8"
      >
        {!submitted && (
          <div className="mb-6 text-center">
            <h2 className="font-serif text-2xl font-semibold" style={{ color: theme.accentStrong }}>
              Kindly respond
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your response helps the hosts prepare.
            </p>
            <RsvpDeadlineLine event={event} invite={invite} className="mt-2" />
          </div>
        )}
        <RsvpSection
          token={token}
          invite={invite}
          onSubmitted={onSubmitted}
          theme={theme}
          preview={preview}
        />
      </section>

      <ContactHostButton
        phone={event.contact_phone}
        theme={theme}
        className="mt-6 block text-center"
      />
    </div>
  );
}

export function FormalMini({ className }: { className?: string }) {
  const t = getInviteTheme("formal", undefined, undefined);
  return (
    <div className={className} style={{ background: t.pageBackground }} aria-hidden>
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-3">
        <span className="h-0.5 w-6" style={{ background: t.accentStrong }} />
        <span className="h-1 w-8 rounded" style={{ background: t.eyebrow }} />
        <span className="h-2 w-16 rounded" style={{ background: t.accentStrong }} />
        <div
          className="mt-1 flex w-full flex-col items-center gap-1 border-y py-1.5"
          style={{ borderColor: t.iconBg }}
        >
          <span className="h-2 w-14 rounded" style={{ background: t.accentStrong }} />
          <span className="h-1 w-10 rounded bg-black/15" />
        </div>
      </div>
    </div>
  );
}
