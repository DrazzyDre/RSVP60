"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  QrCode,
  Search,
  Undo2,
  UserCheck,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { RsvpAdmin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { slugify } from "@/lib/share";
import { formatDateTimeShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export default function CheckInPage() {
  const { selectedEventId, selectedEvent, loading: eventsLoading } = useEvents();
  const canEdit = useCanEdit();
  const [search, setSearch] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [rsvps, setRsvps] = useState<RsvpAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accept a ?token= deep link (e.g. from a scanned guest QR code).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) setToken(t);
  }, []);

  const load = useCallback(() => {
    if (!selectedEventId) return;
    setLoading(true);
    setError(null);
    const p = new URLSearchParams({ event_id: selectedEventId });
    if (token && !search.trim()) p.set("token", token);
    else if (search.trim()) p.set("q", search.trim());
    api
      .get<RsvpAdmin[]>(`/api/admin/check-in/search?${p.toString()}`, true)
      .then(setRsvps)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Search failed.")
      )
      .finally(() => setLoading(false));
  }, [selectedEventId, search, token]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-royal">Check-in</h1>
        <p className="text-sm text-muted-foreground">
          {selectedEvent
            ? `Event-day check-in for ${selectedEvent.name}`
            : "Search and check in your guests."}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setToken(null); // typing overrides a token deep-link
            setSearch(e.target.value);
          }}
          placeholder="Search by name, phone or email…"
          className="h-12 pl-10 text-base"
          autoFocus
        />
      </div>

      {token && !search && (
        <p className="text-sm text-muted-foreground">
          Showing the guest from the scanned code.{" "}
          <button className="underline" onClick={() => setToken(null)}>
            Show full roster
          </button>
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading || eventsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : rsvps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {search
              ? "No guests match your search."
              : "No accepted guests yet for this event."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rsvps.map((r) => (
            <CheckInCard key={r.id} rsvp={r} canEdit={canEdit} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckInCard({
  rsvp,
  canEdit,
  onChanged,
}: {
  rsvp: RsvpAdmin;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seats, setSeats] = useState<number>(
    rsvp.checked_in_seats ?? rsvp.seats_requested
  );
  const [showQr, setShowQr] = useState(false);

  const isAccepted = rsvp.rsvp_status === "accepted";
  const isCheckedIn = Boolean(rsvp.checked_in_at);
  const seatOptions = Array.from({ length: rsvp.seats_requested }, (_, i) => i + 1);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={isCheckedIn ? "border-green-300 bg-green-50/40" : ""}>
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-foreground">{rsvp.full_name}</p>
            <Badge status={rsvp.rsvp_status} />
            {isCheckedIn && (
              <Badge status="active">
                checked in{rsvp.checked_in_seats ? ` · ${rsvp.checked_in_seats}` : ""}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {rsvp.phone}
            {rsvp.invite_tree_name ? ` · ${rsvp.invite_tree_name}` : ""} ·{" "}
            {rsvp.seats_requested} seat{rsvp.seats_requested === 1 ? "" : "s"}
          </p>
          {isCheckedIn && (
            <p className="mt-1 text-xs text-green-700">
              Checked in {formatDateTimeShort(rsvp.checked_in_at)}
              {rsvp.checked_in_by ? ` by ${rsvp.checked_in_by}` : ""}
            </p>
          )}
          {!isAccepted && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Not eligible — this RSVP is {rsvp.rsvp_status}. Change its status to
              accepted first.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowQr(true)}
            title="Guest QR code"
          >
            <QrCode className="h-4 w-4" />
          </Button>

          {canEdit && isAccepted && !isCheckedIn && (
            <div className="flex items-center gap-2">
              {rsvp.seats_requested > 1 && (
                <Select
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="h-9 w-20 text-sm"
                  title="Seats present"
                >
                  {seatOptions.map((n) => (
                    <option key={n} value={n}>
                      {n} seat{n === 1 ? "" : "s"}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    api.post(`/api/admin/rsvps/${rsvp.id}/check-in`, { seats })
                  )
                }
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
                Check in
              </Button>
            </div>
          )}

          {canEdit && isCheckedIn && (
            <div className="flex items-center gap-2">
              <Select
                value={seats}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setSeats(n);
                  run(() =>
                    api.patch(`/api/admin/rsvps/${rsvp.id}/checked-in-seats`, {
                      checked_in_seats: n,
                    })
                  );
                }}
                className="h-9 w-20 text-sm"
                title="Adjust seats present"
                disabled={busy}
              >
                {seatOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} seat{n === 1 ? "" : "s"}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => api.post(`/api/admin/rsvps/${rsvp.id}/undo-check-in`, {}))
                }
              >
                <Undo2 className="h-4 w-4" /> Undo
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {showQr && (
        <GuestQrDialog rsvp={rsvp} onClose={() => setShowQr(false)} />
      )}
    </Card>
  );
}

function GuestQrDialog({
  rsvp,
  onClose,
}: {
  rsvp: RsvpAdmin;
  onClose: () => void;
}) {
  const canvasWrap = useRef<HTMLDivElement>(null);
  const svgWrap = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/admin/check-in?token=${rsvp.check_in_token}`
      : "";
  const fileBase = `rsvp60-checkin-${slugify(rsvp.full_name)}`;

  function downloadPng() {
    const canvas = canvasWrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${fileBase}.png`;
    a.click();
  }
  function downloadSvg() {
    const svg = svgWrap.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `${fileBase}.svg`;
    a.click();
    URL.revokeObjectURL(u);
  }
  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-royal">Check-in QR</h3>
            <p className="text-xs text-muted-foreground">{rsvp.full_name}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div ref={canvasWrap} className="mx-auto flex w-fit justify-center rounded-lg border bg-white p-3">
          <QRCodeCanvas value={url} size={220} level="M" marginSize={2} fgColor="#1E2A6B" />
        </div>
        <div ref={svgWrap} className="hidden">
          <QRCodeSVG value={url} size={512} level="M" marginSize={2} fgColor="#1E2A6B" />
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Scan on the check-in page to find this guest.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={downloadPng}>
            <Download className="h-4 w-4" /> PNG
          </Button>
          <Button size="sm" variant="outline" onClick={downloadSvg}>
            <Download className="h-4 w-4" /> SVG
          </Button>
          <Button size="sm" variant="outline" onClick={copyLink}>
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Link
          </Button>
        </div>
      </div>
    </div>
  );
}
