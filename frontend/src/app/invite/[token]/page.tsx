"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  Clock,
  Gift,
  MapPin,
  MessageCircle,
  Navigation,
  Shirt,
  CalendarPlus,
} from "lucide-react";
import { api, ApiError, resolveMediaUrl } from "@/lib/api";
import type { InvitePublic } from "@/lib/types";
import {
  eventTypeLabel,
  formatDate,
  formatTime,
  invitationVerb,
} from "@/lib/utils";
import { downloadICS, googleCalendarUrl } from "@/lib/calendar";
import { getInviteTheme } from "@/lib/theme";
import { RsvpForm } from "@/components/invite/RsvpForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [invite, setInvite] = useState<InvitePublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<InvitePublic>(`/api/invites/${token}`)
      .then((data) => active && setInvite(data))
      .catch((err) =>
        active &&
        setError(err instanceof ApiError ? err.message : "Unable to load invitation.")
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) return <InviteSkeleton />;

  if (error || !invite) {
    return (
      <main className="invite-gradient flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-semibold text-royal">
            Invitation not found
          </h1>
          <p className="mt-3 text-muted-foreground">
            {error ?? "This invite link is not valid."}
          </p>
        </div>
      </main>
    );
  }

  const { event } = invite;
  const gcal = googleCalendarUrl(event);
  const whatsappNumber = event.contact_phone.replace(/[^\d]/g, "");
  const flyer = resolveMediaUrl(event.flyer_image_url);
  const theme = getInviteTheme(
    event.theme_preset,
    event.accent_color,
    event.background_preset
  );
  const themeStyle = {
    background: theme.pageBackground,
    ["--iv-accent"]: theme.accentStrong,
    ["--iv-eyebrow"]: theme.eyebrow,
    ["--iv-divider"]: theme.divider,
    ["--iv-icon-bg"]: theme.iconBg,
    ["--iv-icon"]: theme.iconColor,
  } as React.CSSProperties;
  const message = event.invite_message || event.description;

  return (
    <main className="min-h-screen pb-16" style={themeStyle}>
      <div className="mx-auto max-w-xl px-4">
        {/* Flyer / hero */}
        <section className="animate-fade-up pt-8">
          <div className="overflow-hidden rounded-3xl border border-gold/30 bg-white shadow-lg">
            {flyer ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={flyer}
                alt={`${event.host_or_celebrant_name || event.name} invitation flyer`}
                className="h-auto w-full object-cover"
              />
            ) : (
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
                  {event.host_or_celebrant_name || event.name}
                </p>
                {event.title && (
                  <p className="mt-3 text-lg text-white/85">{event.title}</p>
                )}
                <div
                  className="mx-auto mt-6 h-px w-32 opacity-70"
                  style={{ background: theme.divider }}
                />
                <p
                  className="mt-4 text-xs font-semibold uppercase tracking-[0.3em]"
                  style={{ color: theme.heroEyebrow }}
                >
                  {eventTypeLabel(event.event_type)}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Invitation text */}
        <section className="animate-fade-up mt-8 text-center">
          {event.invite_headline && flyer && (
            <p
              className="text-sm font-semibold uppercase tracking-[0.3em]"
              style={{ color: "var(--iv-eyebrow)" }}
            >
              {event.invite_headline}
            </p>
          )}
          <p
            className="mt-2 text-xs font-semibold uppercase tracking-[0.3em]"
            style={{ color: "var(--iv-eyebrow)" }}
          >
            {eventTypeLabel(event.event_type)}
          </p>
          <h2
            className="mt-3 font-serif text-3xl font-bold"
            style={{ color: "var(--iv-accent)" }}
          >
            {event.host_or_celebrant_name || event.name}
          </h2>
          <div
            className="mx-auto my-5 h-px w-40"
            style={{ background: "var(--iv-divider)" }}
          />
          <p className="mx-auto max-w-md leading-relaxed text-foreground/80">
            {message}
          </p>
        </section>

        {/* Key details */}
        <section className="animate-fade-up mt-8 space-y-4">
          <DetailCard icon={<CalendarDays className="h-5 w-5" />} title="Date">
            {formatDate(event.event_date)}
          </DetailCard>
          {(event.event_time || event.event_date) && (
            <DetailCard icon={<Clock className="h-5 w-5" />} title="Time">
              {event.event_time || formatTime(event.event_date)}
            </DetailCard>
          )}
          <DetailCard icon={<MapPin className="h-5 w-5" />} title="Venue">
            <span className="font-medium text-foreground">{event.venue_name}</span>
            <br />
            {event.venue_address}
            {event.maps_url && (
              <a href={event.maps_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="mt-3">
                  <Navigation className="h-4 w-4" />
                  Get directions
                </Button>
              </a>
            )}
          </DetailCard>

          {event.dress_code && (
            <DetailCard icon={<Shirt className="h-5 w-5" />} title="Dress code">
              {event.dress_code}
            </DetailCard>
          )}

          {event.gift_details && (
            <DetailCard icon={<Gift className="h-5 w-5" />} title="Gifts">
              {event.gift_details}
            </DetailCard>
          )}
        </section>

        {/* Add to calendar */}
        {event.event_date && (
          <section className="animate-fade-up mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => downloadICS(event)}
            >
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
          </section>
        )}

        {/* RSVP */}
        <section
          id="rsvp"
          className="animate-fade-up mt-10 rounded-2xl border border-gold/30 bg-white p-6 shadow-md sm:p-8"
        >
          <div className="mb-6 text-center">
            <h3
              className="font-serif text-2xl font-bold"
              style={{ color: "var(--iv-accent)" }}
            >
              Kindly RSVP
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {invitationVerb(event.event_type)}.
            </p>
          </div>

          {invite.accepting_rsvps ? (
            <RsvpForm token={token} invite={invite} />
          ) : (
            <div className="rounded-lg bg-muted px-4 py-6 text-center">
              <p className="font-medium text-foreground">
                RSVPs for this invitation are currently closed.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Please reach out to the host if you have any questions.
              </p>
            </div>
          )}
        </section>

        {/* Contact / WhatsApp */}
        {event.contact_phone && (
          <section className="animate-fade-up mt-6 text-center">
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" style={{ color: "var(--iv-accent)" }}>
                <MessageCircle className="h-4 w-4" />
                Questions? Message the host
              </Button>
            </a>
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          <p>
            {event.host_or_celebrant_name
              ? `With warm regards — ${event.host_or_celebrant_name} · `
              : ""}
            Powered by RSVP60
          </p>
        </footer>
      </div>
    </main>
  );
}

function DetailCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-white/70 p-5 shadow-sm">
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--iv-icon-bg)", color: "var(--iv-icon)" }}
      >
        {icon}
      </div>
      <div className="text-sm text-muted-foreground">
        <p
          className="font-semibold uppercase tracking-wide"
          style={{ color: "var(--iv-accent)" }}
        >
          {title}
        </p>
        <div className="mt-1 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function InviteSkeleton() {
  return (
    <main className="invite-gradient min-h-screen pb-16">
      <div className="mx-auto max-w-xl space-y-6 px-4 pt-8">
        <Skeleton className="h-64 w-full rounded-3xl" />
        <Skeleton className="mx-auto h-8 w-56" />
        <Skeleton className="mx-auto h-20 w-full" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    </main>
  );
}
