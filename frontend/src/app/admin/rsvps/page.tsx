"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Download,
  Loader2,
  Mail,
  MailCheck,
  Search,
  Send,
  Users,
} from "lucide-react";
import { API_URL, api, ApiError, getToken } from "@/lib/api";
import type { InviteTree, NotifyResult, RsvpAdmin, RsvpStatus } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { useToast } from "@/components/ui/toast";
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
  const toast = useToast();
  const [rsvps, setRsvps] = useState<RsvpAdmin[]>([]);
  const [trees, setTrees] = useState<InviteTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [treeFilter, setTreeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  // When on, changing a guest's status emails them (if they opted in).
  const [notifyOnChange, setNotifyOnChange] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

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
      await api.patch(
        `/api/admin/rsvps/${id}?notify=${notifyOnChange}`,
        { rsvp_status: status }
      );
      toast.success(
        notifyOnChange
          ? "RSVP status updated — guest notified by email."
          : "RSVP status updated."
      );
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
    }
  }

  async function resendConfirmation(id: string) {
    setResendingId(id);
    try {
      const res = await api.post<NotifyResult>(
        `/api/admin/rsvps/${id}/resend-confirmation`,
        {},
        true
      );
      if (res.status === "sent") toast.success(res.detail);
      else toast.info(res.detail);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resend.");
    } finally {
      setResendingId(null);
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
      a.download = `gatherarc-${selectedEvent?.name ?? "guests"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Guest CSV downloaded.");
    } catch {
      toast.error("Could not export CSV.");
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
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <label
              className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
              title="Email the guest when you change their status (if they opted in)"
            >
              <input
                type="checkbox"
                checked={notifyOnChange}
                onChange={(e) => setNotifyOnChange(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-royal"
              />
              <Mail className="h-4 w-4" /> Notify guest on status change
            </label>
          )}
          <Button variant="outline" onClick={exportCsv} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
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
        statusFilter || treeFilter || search.trim() ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No RSVPs match your filters. Try clearing the search or status filter.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-14 text-center">
              <Users className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium text-foreground">No RSVPs yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Share an invite link with your guests — their responses will appear
                here as they RSVP. Invite links live on the Invite Trees page.
              </p>
              <Link href="/admin/invite-trees" className="mt-5">
                <Button variant="outline">
                  <Send className="h-4 w-4" /> Share an invite link
                </Button>
              </Link>
            </CardContent>
          </Card>
        )
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
                    <th className="px-4 py-3 font-medium">Check-in</th>
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
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            {r.email}
                            {r.email_opt_in && (
                              <span
                                className="inline-flex items-center gap-0.5 text-green-700"
                                title="Opted in to email updates"
                              >
                                <MailCheck className="h-3 w-3" /> opted in
                              </span>
                            )}
                          </p>
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
                      <td className="px-4 py-3">
                        <CheckInStatus rsvp={r} />
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
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
                            {r.email && r.email_opt_in && (
                              <button
                                type="button"
                                onClick={() => resendConfirmation(r.id)}
                                disabled={resendingId === r.id}
                                title="Resend confirmation email"
                                aria-label="Resend confirmation email"
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted disabled:opacity-50"
                              >
                                {resendingId === r.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Mail className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
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
                  {r.checked_in_at && (
                    <p className="flex items-center gap-1 text-xs font-medium text-green-700">
                      <Check className="h-3 w-3" /> Checked in
                      {r.checked_in_seats ? ` · ${r.checked_in_seats} seats` : ""} ·{" "}
                      {formatDateTimeShort(r.checked_in_at)}
                    </p>
                  )}
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

function CheckInStatus({ rsvp }: { rsvp: RsvpAdmin }) {
  if (!rsvp.checked_in_at) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-col">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <Check className="h-3 w-3" /> Checked in
        {rsvp.checked_in_seats ? ` · ${rsvp.checked_in_seats}` : ""}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {formatDateTimeShort(rsvp.checked_in_at)}
      </span>
    </span>
  );
}
