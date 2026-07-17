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
 * Joyful — an energetic, celebratory composition: a bold sans headline, playful
 * accent shapes, detail "chips" in a lively grid, and dot dividers. Expressive
 * but tidy and readable — never childish or chaotic.
 */
export function JoyfulRender({
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
    <div className="px-6 py-14 text-center text-white" style={{ background: theme.heroGradient }}>
      <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: theme.heroEyebrow }}>
        {event.invite_headline || "Let's celebrate!"}
      </p>
      <p className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">{displayName}</p>
      {event.title && <p className="mt-2 text-lg font-medium text-white/90">{event.title}</p>}
    </div>
  );

  return (
    <div className="relative mx-auto max-w-xl px-4 pt-8">
      {/* Decorative accent shapes */}
      <span
        className="pointer-events-none absolute -left-6 top-10 h-24 w-24 rounded-full opacity-30 blur-2xl"
        style={{ background: theme.accent }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -right-8 top-40 h-28 w-28 rounded-full opacity-20 blur-2xl"
        style={{ background: theme.iconColor }}
        aria-hidden
      />

      {/* Flyer with a playful offset accent frame */}
      <section className="motion-safe:animate-fade-up relative">
        <div
          className="absolute inset-0 -rotate-2 rounded-3xl"
          style={{ background: theme.iconBg }}
          aria-hidden
        />
        <Flyer
          url={flyerUrl}
          alt={`${displayName} invitation flyer`}
          className="relative overflow-hidden rounded-3xl border-2 shadow-lg"
          fallback={hero}
        />
      </section>

      {/* Headline */}
      <section className="motion-safe:animate-fade-up mt-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: theme.eyebrow }}>
          {typeLabel}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl" style={{ color: theme.accentStrong }}>
          {displayName}
        </h1>
        <DotDivider theme={theme} />
        {message && (
          <p
            className="mx-auto max-w-md rounded-2xl px-5 py-4 leading-relaxed text-foreground/80"
            style={{ background: theme.iconBg }}
          >
            {message}
          </p>
        )}
      </section>

      {/* Detail chips */}
      <section className="motion-safe:animate-fade-up mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Chip icon={<CalendarDays className="h-5 w-5" />} title="Date" theme={theme}>
          {formatDate(event.event_date)}
          {(event.event_time || event.event_date) && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {event.event_time || formatTime(event.event_date)}
            </span>
          )}
        </Chip>
        {event.venue_name && (
          <Chip icon={<MapPin className="h-5 w-5" />} title="Venue" theme={theme}>
            <span className="font-medium text-foreground">{event.venue_name}</span>
            {event.venue_address && <span className="block text-xs">{event.venue_address}</span>}
            <DirectionsButton mapsUrl={event.maps_url} className="mt-2 inline-block" />
          </Chip>
        )}
        {event.dress_code && (
          <Chip icon={<Shirt className="h-5 w-5" />} title="Dress code" theme={theme}>
            {event.dress_code}
          </Chip>
        )}
        {event.gift_details && (
          <Chip icon={<Gift className="h-5 w-5" />} title="Gifts" theme={theme}>
            {event.gift_details}
          </Chip>
        )}
      </section>

      <CalendarActions event={event} className="mt-6" />

      {/* RSVP */}
      <section
        id="rsvp"
        className="motion-safe:animate-fade-up mt-10 rounded-3xl border-2 bg-white p-6 shadow-md sm:p-8"
        style={{ borderColor: theme.iconBg }}
      >
        {!submitted && (
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-extrabold" style={{ color: theme.accentStrong }}>
              Will we see you there?
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
        className="mt-6 block text-center"
      />
    </div>
  );
}

function DotDivider({ theme }: { theme: InvitationTemplateProps["theme"] }) {
  return (
    <div className="my-4 flex items-center justify-center gap-1.5" aria-hidden>
      {[0.4, 0.7, 1, 0.7, 0.4].map((o, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: theme.accent, opacity: o }}
        />
      ))}
    </div>
  );
}

function Chip({
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
    <div className="flex gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: theme.iconBg, color: theme.iconColor }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 text-sm text-muted-foreground">
        <p className="font-bold uppercase tracking-wide" style={{ color: theme.accentStrong }}>
          {title}
        </p>
        <div className="mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function JoyfulMini({ className }: { className?: string }) {
  const t = getInviteTheme("joyful", undefined, undefined);
  return (
    <div className={className} style={{ background: t.pageBackground }} aria-hidden>
      <div className="flex h-full flex-col p-2.5">
        <span className="h-5 w-full rounded" style={{ background: t.heroGradient }} />
        <div className="mt-1.5 flex items-center justify-center gap-1">
          {[0.5, 1, 0.5].map((o, i) => (
            <span
              key={i}
              className="h-1 w-1 rounded-full"
              style={{ background: t.accent, opacity: o }}
            />
          ))}
        </div>
        <div className="mt-1.5 grid flex-1 grid-cols-2 gap-1">
          <span className="rounded" style={{ background: t.iconBg }} />
          <span className="rounded" style={{ background: t.iconBg }} />
          <span className="rounded" style={{ background: t.iconBg }} />
          <span className="rounded" style={{ background: t.iconBg }} />
        </div>
      </div>
    </div>
  );
}
