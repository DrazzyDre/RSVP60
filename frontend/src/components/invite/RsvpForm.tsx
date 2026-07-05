"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Heart,
  Loader2,
  MapPin,
  Navigation,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { InvitePublic, RsvpCreateResponse } from "@/lib/types";
import { downloadICS, googleCalendarUrl } from "@/lib/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";

const SEAT_LABELS: Record<number, string> = {
  1: "Just me",
  2: "Me +1 (2 seats)",
  3: "Me +2 (3 seats)",
};

export function RsvpForm({
  token,
  invite,
  onSubmitted,
}: {
  token: string;
  invite: InvitePublic;
  // Called once a response has been recorded, so the page can drop its
  // pre-submission prompt (heading / deadline) in favour of the confirmation.
  onSubmitted?: () => void;
}) {
  const [attending, setAttending] = useState<boolean | null>(null);
  const [seats, setSeats] = useState<number>(invite.seat_options[0] ?? 1);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [note, setNote] = useState("");
  const [dietary, setDietary] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RsvpCreateResponse | null>(null);

  // Notify the page once a response is recorded (drives the page's pre/post
  // prompt swap). Runs after the result renders, never during render.
  useEffect(() => {
    if (result) onSubmitted?.();
  }, [result, onSubmitted]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (attending === null) {
      setError("Please let us know if you can attend.");
      return;
    }
    if (!fullName.trim() || !phone.trim()) {
      setError("Please enter your full name and phone number.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<RsvpCreateResponse>(
        `/api/invites/${token}/rsvp`,
        {
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          attending,
          seats_requested: attending ? seats : 1,
          note_to_celebrant: note.trim() || null,
          dietary_note: dietary.trim() || null,
          email_opt_in: Boolean(email.trim()) && emailOptIn,
        }
      );
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <RsvpResult result={result} invite={invite} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Attendance choice */}
      <div className="space-y-2">
        <Label>Will you be joining us?</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAttending(true)}
            className={cn(
              "rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors",
              attending === true
                ? "border-royal bg-royal text-white"
                : "border-input bg-white hover:border-royal-light"
            )}
          >
            Yes, I will attend
          </button>
          <button
            type="button"
            onClick={() => setAttending(false)}
            className={cn(
              "rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors",
              attending === false
                ? "border-royal bg-royal text-white"
                : "border-input bg-white hover:border-royal-light"
            )}
          >
            Sorry, I can&apos;t make it
          </button>
        </div>
      </div>

      {/* Seats — only when attending and options exist */}
      {attending === true && invite.seat_options.length > 0 && (
        <div className="space-y-2">
          <Label>How many seats?</Label>
          <div className="grid grid-cols-1 gap-2">
            {invite.seat_options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSeats(opt)}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                  seats === opt
                    ? "border-gold bg-gold/10 text-royal-dark"
                    : "border-input bg-white hover:border-gold"
                )}
              >
                {SEAT_LABELS[opt] ?? `${opt} seats`}
              </button>
            ))}
          </div>
          {invite.plus_one_allowed > 0 &&
            invite.seat_options.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Only limited seating remains for your invitation, so additional
                guests may be placed on the waitlist.
              </p>
            )}
        </div>
      )}

      <div className="gold-divider my-2" />

      {/* Contact details */}
      <div className="space-y-2">
        <Label htmlFor="fullName">
          Full name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Adaobi Okeke"
          autoComplete="name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone number <span className="text-red-500">*</span>
        </Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. +234 801 234 5678"
          autoComplete="tel"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email (optional)</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <label
          className={cn(
            "mt-1 flex cursor-pointer items-start gap-2 text-sm",
            email.trim() ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <input
            type="checkbox"
            checked={Boolean(email.trim()) && emailOptIn}
            disabled={!email.trim()}
            onChange={(e) => setEmailOptIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-royal disabled:opacity-50"
          />
          <span>
            Receive RSVP confirmation and important updates about this event.
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">A message for the host (optional)</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Share a warm note..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dietary">
          Dietary or accessibility needs (optional)
        </Label>
        <Textarea
          id="dietary"
          value={dietary}
          onChange={(e) => setDietary(e.target.value)}
          placeholder="e.g. vegetarian, wheelchair access"
          rows={2}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="gold"
        size="lg"
        className="w-full"
        disabled={submitting}
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Sending..." : "Send my RSVP"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Already responded? Submit again with the same phone number to update your
        RSVP.
      </p>
    </form>
  );
}

/**
 * Post-submission confirmation. Everything here is driven by the API result
 * (status, seats, created/updated) — never by the form's selected option — so
 * an accepted guest never sees waitlist wording and a waitlisted guest is never
 * told they are confirmed. No pre-submission prompts ("Kindly RSVP", deadline)
 * appear.
 */
function RsvpResult({
  result,
  invite,
}: {
  result: RsvpCreateResponse;
  invite: InvitePublic;
}) {
  const { event } = invite;
  const isAccepted = result.status === "accepted";
  const isWaitlist = result.status === "waitlisted";
  const isDeclined = result.status === "declined";
  const seats = result.rsvp.seats_requested;
  const updated = result.updated;

  const Icon = isWaitlist ? Clock : isDeclined ? Heart : CheckCircle2;
  const tone = isWaitlist
    ? "text-amber-600"
    : isDeclined
      ? "text-royal"
      : "text-green-600";

  const heading = isAccepted
    ? updated
      ? "Your RSVP is updated"
      : "You're all set!"
    : isWaitlist
      ? "You're on the waitlist"
      : "Thank you for letting us know";

  const gcal = googleCalendarUrl(event);

  return (
    <div className="animate-fade-up py-4 text-center">
      <Icon className={cn("mx-auto h-14 w-14", tone)} strokeWidth={1.5} />
      <h3 className="mt-4 font-serif text-2xl font-semibold text-royal">
        {heading}
      </h3>
      {updated && (
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          We&apos;ve updated your previous response.
        </p>
      )}
      <p className="mx-auto mt-3 max-w-sm text-muted-foreground">
        {result.message}
      </p>

      {/* Accepted: confirmed seat count + a concise event summary. */}
      {isAccepted && (
        <div className="mx-auto mt-5 max-w-sm space-y-3 rounded-xl border border-gold/30 bg-white/70 p-4 text-left text-sm">
          <p className="flex items-center gap-2 font-medium text-royal-dark">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            {seats === 1 ? "1 seat confirmed" : `${seats} seats confirmed`}
          </p>
          {event.event_date && (
            <p className="flex items-start gap-2 text-muted-foreground">
              <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{formatDate(event.event_date)}</span>
            </p>
          )}
          {event.venue_name && (
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                {event.venue_name}
                {event.venue_address ? `, ${event.venue_address}` : ""}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Waitlisted: still show the essentials, but never a "confirmed" label. */}
      {isWaitlist && event.event_date && (
        <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
          {formatDate(event.event_date)}
          {event.venue_name ? ` · ${event.venue_name}` : ""}
        </p>
      )}

      {/* Add-to-calendar / directions only when actually confirmed. */}
      {isAccepted && (event.event_date || event.maps_url) && (
        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2 sm:flex-row">
          {event.event_date && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => downloadICS(event)}
            >
              <CalendarPlus className="h-4 w-4" />
              Add to calendar
            </Button>
          )}
          {event.maps_url && (
            <a
              href={event.maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="outline" className="w-full">
                <Navigation className="h-4 w-4" />
                Directions
              </Button>
            </a>
          )}
          {event.event_date && gcal && (
            <a
              href={gcal}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="outline" className="w-full">
                <CalendarDays className="h-4 w-4" />
                Google Calendar
              </Button>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
