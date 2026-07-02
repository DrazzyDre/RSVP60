"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { API_URL, api, ApiError, getToken } from "@/lib/api";
import type { InviteTree, RsvpAdmin, RsvpStatus } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeShort } from "@/lib/utils";

const STATUSES: RsvpStatus[] = ["accepted", "declined", "waitlisted", "cancelled"];

export default function RsvpsPage() {
  const { selectedEventId, selectedEvent, loading: eventsLoading } = useEvents();
  const canEdit = useCanEdit();
  const [rsvps, setRsvps] = useState<RsvpAdmin[]>([]);
  const [trees, setTrees] = useState<InviteTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [treeFilter, setTreeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  // Honour a ?status= deep link (e.g. from the dashboard stat cards).
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s && (STATUSES as string[]).includes(s)) setStatusFilter(s);
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (selectedEventId) p.set("event_id", selectedEventId);
    if (statusFilter) p.set("status", statusFilter);
    if (treeFilter) p.set("invite_tree_id", treeFilter);
    if (search.trim()) p.set("search", search.trim());
    return p.toString();
  }, [selectedEventId, statusFilter, treeFilter, search]);

  const load = useCallback(() => {
    if (!selectedEventId) return;
    setLoading(true);
    api
      .get<RsvpAdmin[]>(`/api/admin/rsvps?${query}`, true)
      .then(setRsvps)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, selectedEventId]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0); // debounce search
    return () => clearTimeout(t);
  }, [load, search]);

  // Load trees for the filter dropdown when the event changes.
  useEffect(() => {
    if (!selectedEventId) return;
    api
      .get<InviteTree[]>(`/api/admin/invite-trees?event_id=${selectedEventId}`, true)
      .then(setTrees)
      .catch(() => setTrees([]));
  }, [selectedEventId]);

  async function updateStatus(id: string, status: RsvpStatus) {
    try {
      await api.patch(`/api/admin/rsvps/${id}`, { rsvp_status: status });
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Update failed.");
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/rsvps/export?${query}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rsvp60-${selectedEvent?.name ?? "guests"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not export CSV.");
    } finally {
      setExporting(false);
    }
  }

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">RSVPs</h1>
          <p className="text-sm text-muted-foreground">
            {selectedEvent
              ? `Guest responses for ${selectedEvent.name}`
              : "All guest responses."}
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
          <Select value={treeFilter} onChange={(e) => setTreeFilter(e.target.value)}>
            <option value="">All invite trees</option>
            {trees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading || eventsLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : rsvps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No RSVPs match your filters yet.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Guest</th>
                    <th className="px-4 py-3 font-medium">Invite tree</th>
                    <th className="px-4 py-3 font-medium">Seats</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {canEdit && <th className="px-4 py-3 font-medium">Change</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rsvps.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{r.full_name}</p>
                        <p className="text-xs text-muted-foreground">{r.phone}</p>
                        {r.email && (
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.invite_tree_name}
                      </td>
                      <td className="px-4 py-3 font-medium">{r.seats_requested}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTimeShort(r.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={r.rsvp_status} />
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <Select
                            value={r.rsvp_status}
                            onChange={(e) =>
                              updateStatus(r.id, e.target.value as RsvpStatus)
                            }
                            className="h-9 w-36 text-sm"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s} className="capitalize">
                                {s}
                              </option>
                            ))}
                          </Select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rsvps.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground">{r.phone}</p>
                    </div>
                    <Badge status={r.rsvp_status} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{r.invite_tree_name}</span>
                    <span>{r.seats_requested} seats</span>
                    <span>{formatDateTimeShort(r.created_at)}</span>
                  </div>
                  {canEdit && (
                    <Select
                      value={r.rsvp_status}
                      onChange={(e) =>
                        updateStatus(r.id, e.target.value as RsvpStatus)
                      }
                      className="h-9 text-sm"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s}
                        </option>
                      ))}
                    </Select>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            Showing {rsvps.length} RSVP{rsvps.length === 1 ? "" : "s"}.
          </p>
        </>
      )}
    </div>
  );
}
