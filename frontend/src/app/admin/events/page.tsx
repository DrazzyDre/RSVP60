"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Armchair,
  CalendarPlus,
  ChevronRight,
  ListTree,
  Pencil,
  Users,
} from "lucide-react";
import type { EventAdmin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EventForm } from "@/components/admin/EventForm";
import { AvailabilityNotice } from "@/components/admin/AvailabilityNotice";
import { PreviewInviteButton } from "@/components/admin/PreviewInviteButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { eventTypeLabel, formatDate } from "@/lib/utils";

type Mode = { kind: "list" } | { kind: "edit"; event: EventAdmin };

// Reuse the shared status palette; "draft" reads as a neutral in-progress state.
const STATUS_BADGE: Record<string, string> = {
  active: "active",
  draft: "paused",
  closed: "exhausted",
  archived: "cancelled",
};

export default function EventsPage() {
  const { events, loading, selectedEventId, refreshEvents } = useEvents();
  const canEdit = useCanEdit();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  async function handleSaved(saved: EventAdmin) {
    await refreshEvents();
    toast.success(`“${saved.name}” updated.`);
    setMode({ kind: "list" });
  }

  if (mode.kind === "edit") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <li>
              <Link href="/admin" className="hover:text-royal hover:underline">
                Dashboard
              </Link>
            </li>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <li>
              <button
                type="button"
                onClick={() => setMode({ kind: "list" })}
                className="hover:text-royal hover:underline"
              >
                Events
              </button>
            </li>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <li aria-current="page" className="font-medium text-foreground">
              Edit
            </li>
          </ol>
        </nav>
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">Edit event</h1>
          <p className="text-sm text-muted-foreground">
            Update this event’s invitation details and status.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <EventForm
              event={mode.event}
              onSaved={handleSaved}
              onCancel={() => setMode({ kind: "list" })}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">Events</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage every event on GatherArc.
          </p>
        </div>
        {canEdit && (
          <Link href="/admin/events/new">
            <Button>
              <CalendarPlus className="h-4 w-4" /> Create event
            </Button>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyEvents canEdit={canEdit} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((ev) => (
            <EventCard
              key={ev.id}
              ev={ev}
              isCurrent={ev.id === selectedEventId}
              canEdit={canEdit}
              onEdit={() => setMode({ kind: "edit", event: ev })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({
  ev,
  isCurrent,
  canEdit,
  onEdit,
}: {
  ev: EventAdmin;
  isCurrent: boolean;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <Card className={isCurrent ? "border-royal ring-1 ring-royal/20" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{ev.name}</CardTitle>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {isCurrent && (
              <Badge className="bg-royal text-white">Current</Badge>
            )}
            <Badge status={STATUS_BADGE[ev.status] ?? "default"}>{ev.status}</Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {eventTypeLabel(ev.event_type)} · {formatDate(ev.event_date)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Metric icon={<ListTree className="h-4 w-4" />} value={ev.tree_count} label="trees" />
          <Metric icon={<Users className="h-4 w-4" />} value={ev.rsvp_count} label="RSVPs" />
          <Metric
            icon={<Armchair className="h-4 w-4" />}
            value={ev.confirmed_seats}
            label="confirmed"
          />
        </div>

        {ev.tree_count === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No invite trees yet — add one to start collecting RSVPs.
          </p>
        )}
        {!ev.accepting_rsvps && (
          <AvailabilityNotice
            accepting={false}
            label={ev.availability_label}
            reason={ev.availability_reason}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/e/${ev.id}`}>
            <Button size="sm" variant="secondary">
              Open workspace
            </Button>
          </Link>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <PreviewInviteButton eventId={ev.id} variant="ghost" label="Preview" />
          <Link href={`/admin/e/${ev.id}/invite-trees`}>
            <Button size="sm" variant="ghost">
              <ListTree className="h-4 w-4" /> Invite trees
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-royal">
        {icon}
        <span className="text-base font-bold text-foreground">{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyEvents({ canEdit }: { canEdit: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-royal/10 text-royal">
          <CalendarPlus className="h-7 w-7" />
        </div>
        <h2 className="mt-4 font-serif text-xl font-semibold text-royal">
          No events yet
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Create your first event to start building invite trees, sharing links
          and collecting RSVPs. New events start as a private draft you can polish
          before going live.
        </p>
        {canEdit ? (
          <Link href="/admin/events/new" className="mt-5">
            <Button>
              <CalendarPlus className="h-4 w-4" /> Create event
            </Button>
          </Link>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Ask an owner or admin to create the first event.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
