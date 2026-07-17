"use client";

import * as React from "react";
import type { InvitationTemplateProps } from "@/components/invite/template-types";
import { getInviteTheme } from "@/lib/theme";
import { eventTypeLabel, formatDate, formatTime, invitationVerb } from "@/lib/utils";
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
 * Classic — a timeless, framed invitation card. Everything sits inside a
 * double-ruled card with a clear host → occasion → date/venue hierarchy, a
 * familiar "cordially invited" feel that is warm without being wedding-specific.
 */
export function ClassicRender({
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
    <div className="mx-auto max-w-xl px-4 pt-8">
      <article
        className="motion-safe:animate-fade-up overflow-hidden rounded-2xl bg-white shadow-lg"
        style={{ border: `1px solid ${theme.accentStrong}` }}
      >
        {/* Inner ruled frame */}
        <div className="m-2 rounded-xl p-6 sm:p-8" style={{ border: `1px solid ${theme.iconBg}` }}>
          <header className="text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.3em]"
              style={{ color: theme.eyebrow }}
            >
              {event.invite_headline || "You are cordially invited"}
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              {typeLabel}
            </p>
            <h1
              className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl"
              style={{ color: theme.accentStrong }}
            >
              {displayName}
            </h1>
            {event.title && (
              <p className="mt-2 text-base text-muted-foreground">{event.title}</p>
            )}
          </header>

          <div className="my-6 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1" style={{ background: theme.divider }} />
            <span
              className="h-1.5 w-1.5 rotate-45"
              style={{ background: theme.accentStrong }}
            />
            <span className="h-px flex-1" style={{ background: theme.divider }} />
          </div>

          {/* Framed flyer inset — omitted entirely when missing or failed. */}
          {showFlyer && (
            <div className="mb-6 overflow-hidden rounded-lg border">
              <FlyerImage
                state={flyerState}
                url={flyerUrl}
                alt={`${displayName} invitation flyer`}
              />
            </div>
          )}

          {/* Date / venue block */}
          <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                When
              </p>
              <p className="mt-1 font-serif text-lg font-semibold" style={{ color: theme.accentStrong }}>
                {formatDate(event.event_date)}
              </p>
              {(event.event_time || event.event_date) && (
                <p className="text-sm text-muted-foreground">
                  {event.event_time || formatTime(event.event_date)}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Where
              </p>
              {event.venue_name ? (
                <>
                  <p className="mt-1 font-medium text-foreground">{event.venue_name}</p>
                  {event.venue_address && (
                    <p className="text-sm text-muted-foreground">{event.venue_address}</p>
                  )}
                  <DirectionsButton mapsUrl={event.maps_url} className="mt-2 inline-block" />
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">To be announced</p>
              )}
            </div>
          </div>

          {message && (
            <p className="mx-auto mt-6 max-w-md text-center leading-relaxed text-foreground/80">
              {message}
            </p>
          )}

          {(event.dress_code || event.gift_details) && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {event.dress_code && (
                <InfoBlock title="Dress code">{event.dress_code}</InfoBlock>
              )}
              {event.gift_details && (
                <InfoBlock title="Gifts">{event.gift_details}</InfoBlock>
              )}
            </div>
          )}

          <CalendarActions event={event} className="mt-6" />
        </div>
      </article>

      {/* RSVP */}
      <section
        id="rsvp"
        className="motion-safe:animate-fade-up mt-8 rounded-2xl border bg-white p-6 shadow-md sm:p-8"
      >
        {!submitted && (
          <div className="mb-6 text-center">
            <h2 className="font-serif text-2xl font-bold" style={{ color: theme.accentStrong }}>
              Please reply
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

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-1 leading-relaxed text-foreground/80">{children}</div>
    </div>
  );
}

export function ClassicMini({ className }: { className?: string }) {
  const t = getInviteTheme("classic", undefined, undefined);
  return (
    <div className={className} style={{ background: t.pageBackground }} aria-hidden>
      <div className="flex h-full items-center justify-center p-2.5">
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1 rounded p-2"
          style={{ border: `1px solid ${t.accentStrong}`, background: "#fff" }}
        >
          <span className="h-2 w-14 rounded" style={{ background: t.accentStrong }} />
          <span className="my-0.5 h-px w-10" style={{ background: t.divider }} />
          <div className="mt-0.5 flex w-full gap-1 px-1">
            <span className="h-5 flex-1 rounded bg-black/10" />
            <span className="h-5 flex-1 rounded bg-black/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
