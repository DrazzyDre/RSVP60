"use client";

import * as React from "react";
import { CalendarDays, Clock, Gift, MapPin, Shirt } from "lucide-react";
import type { InvitationTemplateProps } from "@/components/invite/template-types";
import { getInviteTheme } from "@/lib/theme";
import { eventTypeLabel, formatDate, formatTime, invitationVerb } from "@/lib/utils";
import {
  CalendarActions,
  ContactHostButton,
  DirectionsButton,
  Flyer,
  RsvpDeadlineLine,
  RsvpSection,
} from "@/components/invite/shared";

/**
 * Elegant — a refined editorial invitation: centred serif hierarchy, generous
 * spacing, ornamental dividers, and the flyer integrated as a framed hero.
 * Deliberately preserves GatherArc's original invitation look so existing
 * `elegant` events are visually unchanged.
 */
export function ElegantRender({
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

  const hero = (
    <div
      className="px-6 py-16 text-center text-white"
      style={{ background: theme.heroGradient }}
    >
      <p
        className="text-sm font-semibold uppercase tracking-[0.3em]"
        style={{ color: theme.heroEyebrow }}
      >
        {event.invite_headline || "You are invited"}
      </p>
      <p className="mt-6 font-serif text-4xl font-bold leading-tight sm:text-5xl">
        {displayName}
      </p>
      {event.title && <p className="mt-3 text-lg text-white/85">{event.title}</p>}
      <div
        className="mx-auto mt-6 h-px w-32 opacity-70"
        style={{ background: theme.divider }}
        aria-hidden
      />
      <p
        className="mt-4 text-xs font-semibold uppercase tracking-[0.3em]"
        style={{ color: theme.heroEyebrow }}
      >
        {typeLabel}
      </p>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl px-4">
      {/* Flyer / hero */}
      <section className="motion-safe:animate-fade-up pt-8">
        <Flyer
          url={flyerUrl}
          alt={`${displayName} invitation flyer`}
          className="overflow-hidden rounded-3xl border shadow-lg"
          fallback={hero}
        />
      </section>

      {/* Invitation text */}
      <section className="motion-safe:animate-fade-up mt-8 text-center">
        {event.invite_headline && flyerUrl && (
          <p
            className="text-sm font-semibold uppercase tracking-[0.3em]"
            style={{ color: theme.eyebrow }}
          >
            {event.invite_headline}
          </p>
        )}
        <p
          className="mt-2 text-xs font-semibold uppercase tracking-[0.3em]"
          style={{ color: theme.eyebrow }}
        >
          {typeLabel}
        </p>
        <h1
          className="mt-3 font-serif text-3xl font-bold"
          style={{ color: theme.accentStrong }}
        >
          {displayName}
        </h1>
        <div
          className="mx-auto my-5 h-px w-40"
          style={{ background: theme.divider }}
          aria-hidden
        />
        {message && (
          <p className="mx-auto max-w-md leading-relaxed text-foreground/80">{message}</p>
        )}
      </section>

      {/* Key details */}
      <section className="motion-safe:animate-fade-up mt-8 space-y-4">
        <DetailCard icon={<CalendarDays className="h-5 w-5" />} title="Date" theme={theme}>
          {formatDate(event.event_date)}
        </DetailCard>
        {(event.event_time || event.event_date) && (
          <DetailCard icon={<Clock className="h-5 w-5" />} title="Time" theme={theme}>
            {event.event_time || formatTime(event.event_date)}
          </DetailCard>
        )}
        {event.venue_name && (
          <DetailCard icon={<MapPin className="h-5 w-5" />} title="Venue" theme={theme}>
            <span className="font-medium text-foreground">{event.venue_name}</span>
            {event.venue_address && (
              <>
                <br />
                {event.venue_address}
              </>
            )}
            <DirectionsButton mapsUrl={event.maps_url} className="mt-3 inline-block" />
          </DetailCard>
        )}
        {event.dress_code && (
          <DetailCard icon={<Shirt className="h-5 w-5" />} title="Dress code" theme={theme}>
            {event.dress_code}
          </DetailCard>
        )}
        {event.gift_details && (
          <DetailCard icon={<Gift className="h-5 w-5" />} title="Gifts" theme={theme}>
            {event.gift_details}
          </DetailCard>
        )}
      </section>

      <CalendarActions event={event} className="motion-safe:animate-fade-up mt-6" />

      {/* RSVP */}
      <section
        id="rsvp"
        className="motion-safe:animate-fade-up mt-10 rounded-2xl border bg-white p-6 shadow-md sm:p-8"
      >
        {!submitted && (
          <div className="mb-6 text-center">
            <h2 className="font-serif text-2xl font-bold" style={{ color: theme.accentStrong }}>
              Kindly RSVP
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {invitationVerb(event.event_type)}.
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
        className="motion-safe:animate-fade-up mt-6 block text-center"
      />
    </div>
  );
}

function DetailCard({
  icon,
  title,
  theme,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  theme: InvitationTemplateProps["theme"];
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-white/70 p-5 shadow-sm">
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: theme.iconBg, color: theme.iconColor }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="text-sm text-muted-foreground">
        <p
          className="font-semibold uppercase tracking-wide"
          style={{ color: theme.accentStrong }}
        >
          {title}
        </p>
        <div className="mt-1 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function ElegantMini({ className }: { className?: string }) {
  const t = getInviteTheme("elegant", undefined, undefined);
  return (
    <div
      className={className}
      style={{ background: t.pageBackground }}
      aria-hidden
    >
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-3">
        <span className="h-1 w-8 rounded" style={{ background: t.eyebrow }} />
        <span className="h-2.5 w-20 rounded" style={{ background: t.accentStrong }} />
        <span className="my-0.5 h-px w-10" style={{ background: t.divider }} />
        <span className="h-1 w-24 rounded bg-black/15" />
        <span className="h-1 w-20 rounded bg-black/15" />
        <span className="mt-1.5 h-4 w-16 rounded" style={{ background: t.heroGradient }} />
      </div>
    </div>
  );
}
