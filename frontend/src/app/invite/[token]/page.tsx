"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, resolveMediaUrl } from "@/lib/api";
import type { InvitePublic } from "@/lib/types";
import { getInviteTheme } from "@/lib/theme";
import {
  isKnownTemplate,
  resolveTemplate,
} from "@/lib/invitation-templates";
import { captureClientError } from "@/lib/observability";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Public invitation route. Resolves the event's selected template from its
 * persisted `theme_preset` (with a safe fallback) and renders it through the
 * shared template contract. Data fetching, availability, RSVP and the
 * submitted-state swap stay here; templates only present.
 *
 * The URL is unchanged and template-agnostic — switching templates never
 * changes the invite link.
 */
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [invite, setInvite] = useState<InvitePublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Once the guest submits, the pre-submission prompt gives way to the outcome
  // confirmation (which the shared RSVP form renders from the API result).
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<InvitePublic>(`/api/invites/${token}`)
      .then((data) => active && setInvite(data))
      .catch(
        (err) =>
          active &&
          setError(err instanceof ApiError ? err.message : "Unable to load invitation.")
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  // Safely note (never crash) when a legacy/unknown theme falls back to default.
  // No token or guest PII is included.
  useEffect(() => {
    if (invite && !isKnownTemplate(invite.event.theme_preset)) {
      captureClientError(
        new Error(
          `Invitation template fallback used (preset=${JSON.stringify(
            invite.event.theme_preset ?? null
          )})`
        ),
        { route: "/invite/[token]", source: "invitation-template-fallback" }
      );
    }
  }, [invite]);

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
  const theme = getInviteTheme(
    event.theme_preset,
    event.accent_color,
    event.background_preset
  );
  const flyerUrl = resolveMediaUrl(event.flyer_image_url);
  const template = resolveTemplate(event.theme_preset);
  const Render = template.Render;

  return (
    <main className="min-h-screen pb-16" style={{ background: theme.pageBackground }}>
      <Render
        event={event}
        invite={invite}
        token={token}
        theme={theme}
        flyerUrl={flyerUrl}
        submitted={submitted}
        onSubmitted={() => setSubmitted(true)}
      />

      <footer className="mx-auto mt-10 max-w-xl px-4 text-center text-xs text-muted-foreground">
        <p>
          {event.host_or_celebrant_name
            ? `With warm regards — ${event.host_or_celebrant_name} · `
            : ""}
          Powered by GatherArc — From invite to arrival.
        </p>
      </footer>
    </main>
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
