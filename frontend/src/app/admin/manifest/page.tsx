"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Printer, Rows2, Rows3 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { GuestManifest, ManifestEntry } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { cn, formatDateTimeShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManifestPage() {
  const { selectedEventId, loading: eventsLoading } = useEvents();
  const [data, setData] = useState<GuestManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  // Set client-side once data arrives (avoids a hydration mismatch on the clock).
  const [generatedAt, setGeneratedAt] = useState<string>("");

  useEffect(() => {
    if (!selectedEventId) return;
    setLoading(true);
    setError(null);
    api
      .get<GuestManifest>(`/api/admin/guest-manifest?event_id=${selectedEventId}`, true)
      .then((d) => {
        setData(d);
        setGeneratedAt(new Date().toLocaleString());
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load manifest.")
      )
      .finally(() => setLoading(false));
  }, [selectedEventId]);

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;
  if (loading || eventsLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (error || !data) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? "Failed to load manifest."}
      </p>
    );
  }

  // Group entries by invite tree, in tree_totals order.
  const byTree = new Map<string, ManifestEntry[]>();
  for (const e of data.entries) {
    const arr = byTree.get(e.invite_tree_id) ?? [];
    arr.push(e);
    byTree.set(e.invite_tree_id, arr);
  }

  const cellY = compact ? "py-1" : "py-2";

  return (
    <div className="space-y-6 print:space-y-4 print:text-black">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal print:text-black">
            Guest manifest
          </h1>
          <p className="text-sm text-muted-foreground print:text-black">
            {data.event_name}
            {generatedAt && (
              <span className="print:text-black"> · Generated {generatedAt}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            onClick={() => setCompact((c) => !c)}
            title={compact ? "Comfortable rows" : "Compact rows"}
          >
            {compact ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
            {compact ? "Comfortable" : "Compact"}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-3 gap-4">
        <TotalCard label="Confirmed seats" value={data.total_confirmed_seats} />
        <TotalCard
          label="Checked-in seats"
          value={data.total_checked_in_seats}
          accent="text-green-700"
        />
        <TotalCard
          label="Waitlisted seats"
          value={data.total_pending_seats}
          accent="text-amber-700"
        />
      </div>

      {data.tree_totals.map((t) => {
        const entries = byTree.get(t.invite_tree_id) ?? [];
        return (
          <Card
            key={t.invite_tree_id}
            className="overflow-hidden break-inside-avoid print:shadow-none"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3 print:bg-transparent">
              <h2 className="font-semibold text-royal print:text-black">
                {t.invite_tree_name || "—"}
              </h2>
              <p className="text-xs text-muted-foreground print:text-black">
                {t.guests} confirmed guest{t.guests === 1 ? "" : "s"} ·{" "}
                {t.confirmed_seats} seats · {t.checked_in_seats} checked in
              </p>
            </div>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground print:text-black">
                    <tr>
                      <th className={cn("px-4 font-medium", cellY)}>Guest</th>
                      <th className={cn("px-4 font-medium", cellY)}>Phone</th>
                      <th className={cn("px-4 font-medium", cellY)}>RSVP</th>
                      <th className={cn("px-4 font-medium", cellY)}>Seats</th>
                      <th className={cn("px-4 font-medium", cellY)}>Checked in</th>
                      {!compact && (
                        <th className={cn("px-4 font-medium", cellY)}>Notes</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entries.map((e) => (
                      <tr key={e.id} className="align-top">
                        <td className={cn("px-4 font-medium text-foreground print:text-black", cellY)}>
                          {e.full_name}
                        </td>
                        <td className={cn("px-4 text-muted-foreground print:text-black", cellY)}>
                          {e.phone}
                        </td>
                        <td className={cn("px-4", cellY)}>
                          <Badge status={e.rsvp_status} />
                        </td>
                        <td className={cn("px-4", cellY)}>{e.seats_requested}</td>
                        <td className={cn("px-4", cellY)}>
                          {e.checked_in ? (
                            <span className="font-medium text-green-700 print:text-black">
                              ✓ {e.checked_in_seats}
                              {!compact && (
                                <> · {formatDateTimeShort(e.checked_in_at)}</>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground print:text-black">
                              <span className="inline-block h-2 w-2 rounded-full border border-gray-400" />
                              Not in
                            </span>
                          )}
                        </td>
                        {!compact && (
                          <td className="max-w-[16rem] px-4 py-2 text-xs text-muted-foreground print:text-black">
                            {[e.dietary_note, e.note_to_celebrant]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TotalCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card className="print:shadow-none">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground print:text-black">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-bold ${accent ?? "text-royal"} print:text-black`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
