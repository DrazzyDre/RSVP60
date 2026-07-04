"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Pause,
  Play,
  Plus,
  TreePine,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { EventAdmin, InviteTree } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EmptyEventState } from "@/components/admin/EmptyEventState";
import { InviteTreeShare } from "@/components/admin/InviteTreeShare";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const PLUS_ONE_LABELS: Record<number, string> = {
  0: "No plus-one",
  1: "+1 allowed",
  2: "+2 allowed",
};

export default function InviteTreesPage() {
  const { selectedEventId, selectedEvent, loading: eventsLoading } = useEvents();
  const canEdit = useCanEdit();
  const [trees, setTrees] = useState<InviteTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    if (!selectedEventId) return;
    setLoading(true);
    api
      .get<InviteTree[]>(`/api/admin/invite-trees?event_id=${selectedEventId}`, true)
      .then(setTrees)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedEventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!eventsLoading && !selectedEventId) return <EmptyEventState />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-royal">Invite Trees</h1>
          <p className="text-sm text-muted-foreground">
            {selectedEvent
              ? `Seat allocations for ${selectedEvent.name}`
              : "Seat allocations and secure invite links."}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowCreate((s) => !s)}>
            <Plus className="h-4 w-4" /> New tree
          </Button>
        )}
      </div>

      {canEdit && showCreate && selectedEventId && (
        <CreateTreeCard
          eventId={selectedEventId}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {loading || eventsLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : trees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <TreePine className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium text-foreground">
              Create your first invite tree
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              An invite tree is a named group (e.g. “Family” or “Work Friends”)
              with its own seat allocation and a private invite link. Guests RSVP
              through the link, and seats are drawn from that group’s allocation —
              once it’s full, further guests are waitlisted.
            </p>
            {canEdit && !showCreate && (
              <Button className="mt-5" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> New invite tree
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {trees.map((tree) => (
            <TreeCard
              key={tree.id}
              tree={tree}
              event={selectedEvent}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTreeCard({
  eventId,
  onCreated,
  onCancel,
}: {
  eventId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(20);
  const [extra, setExtra] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await api.post(
        "/api/admin/invite-trees",
        { event_id: eventId, name, allocated_seats: seats, max_extra_guests: extra },
        true
      );
      toast.success(`Invite tree “${name}” created.`);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create tree.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New invite tree</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <Label>Tree name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Family"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Allocated seats</Label>
            <Input
              type="number"
              min={0}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Plus-one rule</Label>
            <Select value={extra} onChange={(e) => setExtra(Number(e.target.value))}>
              <option value={0}>No plus-one (1 seat)</option>
              <option value={1}>+1 allowed (2 seats)</option>
              <option value={2}>+2 allowed (3 seats)</option>
            </Select>
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 sm:col-span-3">
              {error}
            </p>
          )}
          <div className="flex gap-3 sm:col-span-3">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TreeCard({
  tree,
  event,
  onChanged,
}: {
  tree: InviteTree;
  event: EventAdmin | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tree.name);
  const [seats, setSeats] = useState(tree.allocated_seats);
  const [extra, setExtra] = useState(tree.max_extra_guests);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = useCanEdit();
  const pct =
    tree.allocated_seats > 0
      ? Math.min(Math.round((tree.used_seats / tree.allocated_seats) * 100), 100)
      : 0;

  async function patch(body: Record<string, unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/admin/invite-trees/${tree.id}`, body);
      setEditing(false);
      onChanged();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Update failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function pauseTree() {
    const ok = await confirm({
      title: `Pause “${tree.name}”?`,
      description:
        "Guests with this invite link will not be able to RSVP until you reactivate it. Existing RSVPs are kept.",
      confirmLabel: "Pause invites",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (ok) patch({ status: "paused" }, "Invite tree paused.");
  }

  function copyLink() {
    navigator.clipboard.writeText(tree.invite_url).then(() => {
      setCopied(true);
      toast.success("Invite link copied.");
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{tree.name}</CardTitle>
          <Badge status={tree.computed_status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {PLUS_ONE_LABELS[tree.max_extra_guests]} · {tree.rsvp_count} RSVPs
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Usage bar */}
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium text-foreground">
              {tree.used_seats} / {tree.allocated_seats} seats used
            </span>
            <span className="text-muted-foreground">{tree.remaining_seats} left</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-royal to-gold"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Invite link */}
        <div className="flex items-center gap-2">
          <Input readOnly value={tree.invite_url} className="text-xs" />
          <Button size="icon" variant="outline" onClick={copyLink} title="Copy link">
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* WhatsApp share + QR code */}
        <InviteTreeShare
          inviteUrl={tree.invite_url}
          event={event}
          treeName={tree.name}
        />

        {canEdit && (editing ? (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Seats</Label>
                <Input
                  type="number"
                  min={0}
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Plus-one</Label>
                <Select
                  value={extra}
                  onChange={(e) => setExtra(Number(e.target.value))}
                >
                  <option value={0}>None</option>
                  <option value={1}>+1</option>
                  <option value={2}>+2</option>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  patch(
                    {
                      name,
                      allocated_seats: seats,
                      max_extra_guests: extra,
                    },
                    "Invite tree updated."
                  )
                }
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {tree.status === "paused" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => patch({ status: "active" }, "Invite tree reactivated.")}
              >
                <Play className="h-4 w-4" /> Reactivate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={pauseTree}
              >
                <Pause className="h-4 w-4" /> Pause
              </Button>
            )}
          </div>
        ))}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
