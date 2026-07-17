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
 * Minimal — a restrained, whitespace-led layout: left-aligned, strong
 * typography, a compact definition-list for details, thin hairlines and no
 * cards or icons. Modern and quietly premium.
 */
export function MinimalRender({
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

  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Date", value: formatDate(event.event_date) },
  ];
  if (event.event_time || event.event_date) {
    details.push({ label: "Time", value: event.event_time || formatTime(event.event_date) });
  }
  if (event.venue_name) {
    details.push({
      label: "Venue",
      value: (
        <>
          <span className="text-foreground">{event.venue_name}</span>
          {event.venue_address && <span className="block">{event.venue_address}</span>}
          <DirectionsButton mapsUrl={event.maps_url} className="mt-2 inline-block" />
        </>
      ),
    });
  }
  if (event.dress_code) details.push({ label: "Dress code", value: event.dress_code });
  if (event.gift_details) details.push({ label: "Gifts", value: event.gift_details });

  return (
    <div className="mx-auto max-w-lg px-5 pt-10">
      {/* Masthead */}
      <header className="motion-safe:animate-fade-up">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.35em]"
          style={{ color: theme.eyebrow }}
        >
          {typeLabel}
        </p>
        <h1
          className="mt-3 text-3xl font-bold leading-tight sm:text-4xl"
          style={{ color: theme.accentStrong }}
        >
          {displayName}
        </h1>
        {event.title && <p className="mt-2 text-base text-muted-foreground">{event.title}</p>}
        <div className="mt-5 h-px w-full" style={{ background: theme.divider }} aria-hidden />
      </header>

      {/* Optional clean flyer — omitted entirely when missing or failed, so the
          typography and details occupy the intended space. */}
      {showFlyer && (
        <div className="motion-safe:animate-fade-up mt-6 overflow-hidden rounded-lg">
          <FlyerImage
            state={flyerState}
            url={flyerUrl}
            alt={`${displayName} invitation flyer`}
          />
        </div>
      )}

      {message && (
        <p className="motion-safe:animate-fade-up mt-6 text-[15px] leading-7 text-foreground/80">
          {message}
        </p>
      )}

      {/* Definition-list details */}
      <dl className="motion-safe:animate-fade-up mt-8 divide-y divide-border">
        {details.map((d) => (
          <div key={d.label} className="grid grid-cols-[7rem_1fr] gap-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {d.label}
            </dt>
            <dd className="text-sm leading-relaxed text-foreground/80">{d.value}</dd>
          </div>
        ))}
      </dl>

      <CalendarActions event={event} className="mt-6" />

      {/* RSVP */}
      <section id="rsvp" className="motion-safe:animate-fade-up mt-10 border-t pt-8">
        {!submitted && (
          <div className="mb-6">
            <h2 className="text-xl font-bold" style={{ color: theme.accentStrong }}>
              RSVP
            </h2>
            <RsvpDeadlineLine event={event} invite={invite} className="mt-1" />
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
        className="mt-6 block"
      />
    </div>
  );
}

export function MinimalMini({ className }: { className?: string }) {
  const t = getInviteTheme("minimal", undefined, undefined);
  return (
    <div className={className} style={{ background: t.pageBackground }} aria-hidden>
      <div className="flex h-full flex-col justify-center gap-1.5 p-3">
        <span className="h-1 w-6 rounded" style={{ background: t.eyebrow }} />
        <span className="h-2.5 w-16 rounded" style={{ background: t.accentStrong }} />
        <span className="my-1 h-px w-full" style={{ background: t.divider }} />
        <span className="h-1 w-20 rounded bg-black/15" />
        <span className="h-1 w-14 rounded bg-black/15" />
        <span className="h-1 w-16 rounded bg-black/10" />
      </div>
    </div>
  );
}
