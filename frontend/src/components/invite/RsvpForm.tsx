"use client";

import * as React from "react";
import { useState } from "react";
import { CheckCircle2, Clock, Heart, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { InvitePublic, RsvpCreateResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SEAT_LABELS: Record<number, string> = {
  1: "Just me",
  2: "Me +1 (2 seats)",
  3: "Me +2 (3 seats)",
};

export function RsvpForm({
  token,
  invite,
}: {
  token: string;
  invite: InvitePublic;
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
    return <RsvpResult result={result} />;
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

function RsvpResult({ result }: { result: RsvpCreateResponse }) {
  const isWaitlist = result.status === "waitlisted";
  const isDeclined = result.status === "declined";

  const Icon = isWaitlist ? Clock : isDeclined ? Heart : CheckCircle2;
  const tone = isWaitlist
    ? "text-amber-600"
    : isDeclined
      ? "text-royal"
      : "text-green-600";

  return (
    <div className="animate-fade-up py-6 text-center">
      <Icon className={cn("mx-auto h-14 w-14", tone)} strokeWidth={1.5} />
      <h3 className="mt-4 font-serif text-2xl font-semibold text-royal">
        {isWaitlist
          ? "You're on the waitlist"
          : isDeclined
            ? "Thank you for letting us know"
            : "You're all set!"}
      </h3>
      <p className="mx-auto mt-3 max-w-sm text-muted-foreground">
        {result.message}
      </p>
      {result.updated && (
        <p className="mt-3 text-xs text-muted-foreground">
          Your previous RSVP was updated.
        </p>
      )}
    </div>
  );
}
