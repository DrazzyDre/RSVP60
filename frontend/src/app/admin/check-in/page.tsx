"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  QrCode,
  ScanLine,
  Search,
  Undo2,
  UserCheck,
  WifiOff,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { RsvpAdmin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { QrScannerDialog } from "@/components/admin/QrScannerDialog";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { useOnline } from "@/lib/hooks";
import { slugify } from "@/lib/share";
import { cn, formatDateTimeShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Filter = "all" | "not_in" | "in" | "issues";

export default function CheckInPage() {
  const { selectedEventId, selectedEvent, loading: eventsLoading } = useEvents();
  const canEdit = useCanEdit();
  const online = useOnline();
  const [search, setSearch] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [rsvps, setRsvps] = useState<RsvpAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [scanOpen, setScanOpen] = useState(false);

  // Accept a ?token= deep link (e.g. from a scanned guest QR code).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) setToken(t);
  }, []);

  const tokenMode = Boolean(token && !search.trim());

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

  function clearSearch() {
    setSearch("");
    setToken(null);
    setFilter("all");
  }

  function handleScan(scanned: string) {
    setScanOpen(false);
    setSearch("");
    setFilter("all");
    setToken(scanned);
  }

  // Client-side quick filters over the loaded results.
  const counts = useMemo(() => {
    let notIn = 0;
    let inCount = 0;
    let issues = 0;
    for (const r of rsvps) {
      if (r.rsvp_status !== "accepted") issues += 1;
      else if (r.checked_in_at) inCount += 1;
      else notIn += 1;
    }
    return { all: rsvps.length, not_in: notIn, in: inCount, issues };
  }, [rsvps]);

  const visible = useMemo(() => {
    switch (filter) {
      case "not_in":
        return rsvps.filter((r) => r.rsvp_status === "accepted" && !r.checked_in_at);
      case "in":
        return rsvps.filter((r) => Boolean(r.checked_in_at));
      case "issues":
        return rsvps.filter((r) => r.rsvp_status !== "accepted");
      default:
        return rsvps;
    }
  }, [rsvps, filter]);

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold text-royal">Check-in</h1>
        <p className="text-sm text-muted-foreground">
          {selectedEvent
            ? `Event-day check-in for ${selectedEvent.name}`
            : "Search, scan and check in your guests."}
        </p>
      </div>

      {!online && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          You&apos;re offline. Check-in actions are paused until the connection is
          back. Any manifest already loaded stays available to view and print.
        </div>
      )}

      {/* Search + scan */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setToken(null); // typing overrides a token deep-link
              setSearch(e.target.value);
            }}
            placeholder="Search by name, phone or email…"
            className="h-12 pl-10 pr-10 text-base"
            autoFocus
          />
          {(search || token) && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-12 px-4"
          onClick={() => setScanOpen(true)}
        >
          <ScanLine className="h-5 w-5" />
          <span className="hidden sm:inline">Scan</span>
        </Button>
      </div>

      {/* Quick filters */}
      {rsvps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label="Not checked in" count={counts.not_in} active={filter === "not_in"} onClick={() => setFilter("not_in")} />
          <FilterChip label="Checked in" count={counts.in} active={filter === "in"} onClick={() => setFilter("in")} tone="green" />
          {counts.issues > 0 && (
            <FilterChip label="Issues" count={counts.issues} active={filter === "issues"} onClick={() => setFilter("issues")} tone="amber" />
          )}
        </div>
      )}

      {tokenMode && (
        <p className="text-sm text-muted-foreground">
          Showing the guest from the scanned code.{" "}
          <button className="font-medium text-royal underline" onClick={clearSearch}>
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
            {tokenMode
              ? "No guest matches that scanned code. Try scanning again, or search by name."
              : search
                ? "No guests match your search."
                : "No accepted guests yet for this event."}
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No guests in this view. Try a different filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <CheckInCard
              key={r.id}
              rsvp={r}
              canEdit={canEdit}
              online={online}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {scanOpen && (
        <QrScannerDialog onDetected={handleScan} onClose={() => setScanOpen(false)} />
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone = "royal",
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: "royal" | "green" | "amber";
}) {
  const activeTone =
    tone === "green"
      ? "border-green-600 bg-green-600 text-white"
      : tone === "amber"
        ? "border-amber-500 bg-amber-500 text-white"
        : "border-royal bg-royal text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? activeTone
          : "border-input bg-white text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-xs",
          active ? "bg-white/25" : "bg-muted"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function CheckInCard({
  rsvp,
  canEdit,
  online,
  onChanged,
}: {
  rsvp: RsvpAdmin;
  canEdit: boolean;
  online: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seats, setSeats] = useState<number>(
    rsvp.checked_in_seats ?? rsvp.seats_requested
  );
  const [showQr, setShowQr] = useState(false);

  const isAccepted = rsvp.rsvp_status === "accepted";
  const isCheckedIn = Boolean(rsvp.checked_in_at);
  const seatOptions = Array.from({ length: rsvp.seats_requested }, (_, i) => i + 1);

  async function run(fn: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Action failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function undoCheckIn() {
    const ok = await confirm({
      title: "Undo this check-in?",
      description: `${rsvp.full_name} will be marked as not checked in and can be checked in again.`,
      confirmLabel: "Undo check-in",
      cancelLabel: "Keep checked in",
      destructive: true,
    });
    if (ok) {
      run(
        () => api.post(`/api/admin/rsvps/${rsvp.id}/undo-check-in`, {}),
        "Check-in undone."
      );
    }
  }

  return (
    <Card
      className={cn(
        isCheckedIn && "border-green-400 bg-green-50/50",
        !isAccepted && "border-amber-300 bg-amber-50/40"
      )}
    >
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-foreground">{rsvp.full_name}</p>
            <Badge status={rsvp.rsvp_status} />
            {isCheckedIn && (
              <Badge className="bg-green-600 text-white">
                <Check className="mr-1 h-3 w-3" /> Checked in
                {rsvp.checked_in_seats ? ` · ${rsvp.checked_in_seats}` : ""}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {rsvp.phone}
            {rsvp.invite_tree_name ? ` · ${rsvp.invite_tree_name}` : ""} ·{" "}
            {rsvp.seats_requested} seat{rsvp.seats_requested === 1 ? "" : "s"}
          </p>
          {isCheckedIn && (
            <p className="mt-1.5 flex items-center gap-1.5 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              <Check className="h-3.5 w-3.5" />
              Checked in {formatDateTimeShort(rsvp.checked_in_at)}
              {rsvp.checked_in_by ? ` by ${rsvp.checked_in_by}` : ""}
            </p>
          )}
          {!isAccepted && (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Not eligible to check in — this RSVP is {rsvp.rsvp_status}. Change its
              status to accepted on the RSVPs page first.
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
            aria-label="Guest QR code"
          >
            <QrCode className="h-4 w-4" />
          </Button>

          {canEdit && isAccepted && !isCheckedIn && (
            <div className="flex items-center gap-2">
              {rsvp.seats_requested > 1 && (
                <Select
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="h-12 w-24 text-sm"
                  title="Seats present"
                  disabled={!online}
                >
                  {seatOptions.map((n) => (
                    <option key={n} value={n}>
                      {n} seat{n === 1 ? "" : "s"}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                size="lg"
                className="h-12"
                disabled={busy || !online}
                title={online ? undefined : "Unavailable while offline"}
                onClick={() =>
                  run(
                    () =>
                      api.post(`/api/admin/rsvps/${rsvp.id}/check-in`, { seats }),
                    `${rsvp.full_name} checked in.`
                  )
                }
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <UserCheck className="h-5 w-5" />
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
                className="h-11 w-24 text-sm"
                title="Adjust seats present"
                disabled={busy || !online}
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
                className="h-11"
                disabled={busy || !online}
                title={online ? undefined : "Unavailable while offline"}
                onClick={undoCheckIn}
              >
                <Undo2 className="h-4 w-4" /> Undo
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {showQr && <GuestQrDialog rsvp={rsvp} onClose={() => setShowQr(false)} />}
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
