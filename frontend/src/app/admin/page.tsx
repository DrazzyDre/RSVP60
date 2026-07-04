"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  Armchair,
  CalendarCheck,
  CheckCircle2,
  Clock,
  DoorOpen,
  Layers,
  Percent,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardCharts, DashboardSummary } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { QuickActions } from "@/components/admin/QuickActions";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/StatCard";
import {
  CapacityMeter,
  SeatUsageChart,
  StatusPie,
  TrendLine,
} from "@/components/admin/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { selectedEventId, selectedEvent, loading: eventsLoading } = useEvents();
  const canEdit = useCanEdit();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEventId) return;
    let active = true;
    setLoading(true);
    setError(null);
    const q = `?event_id=${selectedEventId}`;
    Promise.all([
      api.get<DashboardSummary>(`/api/admin/dashboard/summary${q}`, true),
      api.get<DashboardCharts>(`/api/admin/dashboard/charts${q}`, true),
    ])
      .then(([s, c]) => {
        if (!active) return;
        setSummary(s);
        setCharts(c);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [selectedEventId]);

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;
  if (loading || eventsLoading) return <DashboardSkeleton />;
  if (error || !summary || !charts)
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? "Failed to load dashboard."}
      </p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {selectedEvent
              ? `Overview for ${selectedEvent.name}`
              : "Overview of seats, RSVPs and invite trees."}
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

      <QuickActions />

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Allocated seats"
          value={summary.total_allocated_seats}
          accent="royal"
          icon={<Armchair className="h-5 w-5" />}
          href="/admin/invite-trees"
        />
        <StatCard
          label="Confirmed seats"
          value={summary.total_confirmed_seats}
          accent="green"
          hint={`${summary.remaining_seats} remaining`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          href="/admin/invite-trees"
        />
        <StatCard
          label="Remaining seats"
          value={summary.remaining_seats}
          accent="gold"
          icon={<Layers className="h-5 w-5" />}
          href="/admin/invite-trees"
        />
        <StatCard
          label="Total RSVPs"
          value={summary.total_rsvps}
          accent="royal"
          icon={<Users className="h-5 w-5" />}
          href="/admin/rsvps"
        />
        <StatCard
          label="Accepted"
          value={summary.accepted_rsvps}
          accent="green"
          icon={<CalendarCheck className="h-5 w-5" />}
          href="/admin/rsvps?status=accepted"
        />
        <StatCard
          label="Declined"
          value={summary.declined_rsvps}
          accent="red"
          icon={<UserX className="h-5 w-5" />}
          href="/admin/rsvps?status=declined"
        />
        <StatCard
          label="Waitlisted"
          value={summary.waitlisted_rsvps}
          accent="amber"
          icon={<Clock className="h-5 w-5" />}
          href="/admin/rsvps?status=waitlisted"
        />
        <StatCard
          label="Exhausted trees"
          value={`${summary.exhausted_trees}/${summary.total_trees}`}
          accent="gray"
          icon={<Layers className="h-5 w-5" />}
          href="/admin/invite-trees"
        />
      </div>

      {/* Event-day check-in */}
      <div>
        <h2 className="mb-3 font-serif text-lg font-semibold text-royal">
          Event-day check-in
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Checked-in guests"
            value={summary.checked_in_rsvps}
            accent="green"
            hint={`of ${summary.accepted_rsvps} accepted`}
            icon={<UserCheck className="h-5 w-5" />}
            href="/admin/check-in"
          />
          <StatCard
            label="Checked-in seats"
            value={summary.checked_in_seats}
            accent="royal"
            icon={<DoorOpen className="h-5 w-5" />}
            href="/admin/check-in"
          />
          <StatCard
            label="Not yet checked in"
            value={summary.confirmed_not_checked_in}
            accent="amber"
            icon={<Clock className="h-5 w-5" />}
            href="/admin/check-in"
          />
          <StatCard
            label="Check-in rate"
            value={`${Math.round(summary.check_in_rate * 100)}%`}
            accent="gold"
            icon={<Percent className="h-5 w-5" />}
            href="/admin/manifest"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Seat usage by invite tree">
          <SeatUsageChart data={charts.seat_usage_by_tree} />
        </ChartCard>
        <ChartCard title="RSVP status breakdown">
          <StatusPie data={charts.rsvp_status_breakdown} />
        </ChartCard>
        <ChartCard title="RSVP submissions over time">
          <TrendLine data={charts.rsvps_over_time} />
        </ChartCard>
        <ChartCard title="Overall capacity">
          <CapacityMeter
            used={charts.capacity.used}
            allocated={charts.capacity.allocated}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-80 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
