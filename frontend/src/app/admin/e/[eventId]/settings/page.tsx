"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarRange,
  Check,
  Image as ImageIcon,
  KeyRound,
  ListTree,
  Loader2,
  Mail,
  Pencil,
  Shield,
  User,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Admin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EventReadiness } from "@/components/admin/EventReadiness";
import { AvailabilityNotice } from "@/components/admin/AvailabilityNotice";
import { FlyerUpload } from "@/components/admin/EventForm";
import { PreviewInviteButton } from "@/components/admin/PreviewInviteButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eventTypeLabel } from "@/lib/utils";

export default function SettingsPage() {
  const { selectedEvent } = useEvents();
  const canEdit = useCanEdit();
  const [admin, setAdmin] = useState<Admin | null>(null);

  useEffect(() => {
    api.get<Admin>("/api/admin/me", true).then(setAdmin).catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-royal">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your account and the currently selected event.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed-in admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row icon={<User className="h-4 w-4" />} label="Name">
            {admin?.full_name || "—"}
          </Row>
          <Row icon={<Mail className="h-4 w-4" />} label="Email">
            {admin?.email || "—"}
          </Row>
          <Row icon={<Shield className="h-4 w-4" />} label="Role">
            <span className="capitalize">{admin?.role || "admin"}</span>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change your password</CardTitle>
        </CardHeader>
        <CardContent>
          <SelfPasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selected event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {selectedEvent ? (
            <>
              <Row icon={<CalendarRange className="h-4 w-4" />} label="Event">
                {selectedEvent.name}
              </Row>
              <Row label="Type">{eventTypeLabel(selectedEvent.event_type)}</Row>
              <Row label="Status">
                <span className="capitalize">{selectedEvent.status}</span>
              </Row>
              <AvailabilityNotice
                accepting={selectedEvent.accepting_rsvps}
                label={selectedEvent.availability_label}
                reason={selectedEvent.availability_reason}
                className="mt-1"
              />
              <Link href="/admin/events">
                <Button variant="outline" size="sm" className="mt-2">
                  Edit event details
                </Button>
              </Link>
            </>
          ) : (
            <p className="text-muted-foreground">No event selected.</p>
          )}
        </CardContent>
      </Card>

      {selectedEvent && canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommended next steps</CardTitle>
            <p className="text-sm text-muted-foreground">
              Finish setting up {selectedEvent.name} before you share invites.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/admin/events">
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" /> Complete event details
              </Button>
            </Link>
            <Link href="/admin/events">
              <Button variant="outline" size="sm">
                <ImageIcon className="h-4 w-4" /> Upload flyer
              </Button>
            </Link>
            <Link href={`/admin/e/${selectedEvent.id}/invite-trees`}>
              <Button variant="outline" size="sm">
                <ListTree className="h-4 w-4" /> Create invite tree
              </Button>
            </Link>
            <PreviewInviteButton eventId={selectedEvent.id} label="Preview public invite" />
          </CardContent>
        </Card>
      )}

      {selectedEvent && canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event flyer</CardTitle>
            <p className="text-sm text-muted-foreground">
              Upload, replace or remove the flyer for {selectedEvent.name}. If a
              flyer failed to upload while creating the event, add it here.
            </p>
          </CardHeader>
          <CardContent>
            <FlyerUpload key={selectedEvent.id} event={selectedEvent} />
          </CardContent>
        </Card>
      )}

      {selectedEvent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event readiness</CardTitle>
            <p className="text-sm text-muted-foreground">
              What to complete before sharing invites for {selectedEvent.name}.
            </p>
          </CardHeader>
          <CardContent>
            <EventReadiness eventId={selectedEvent.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About GatherArc</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            GatherArc is a reusable platform for invitations, RSVPs, guest
            communications and event-day operations. Each event has its own invite
            trees, seat allocations and RSVPs.
          </p>
          <p>
            Owners can add, deactivate and set roles for admin accounts from the
            Admins page. If you don&apos;t see it, ask an owner for access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SelfPasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.patch("/api/admin/me/password", {
        current_password: current,
        new_password: next,
      });
      setCurrent("");
      setNext("");
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Current password</Label>
        <Input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>New password</Label>
        <Input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          autoComplete="new-password"
          required
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : done ? (
            <Check className="h-4 w-4 text-green-300" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {done ? "Password updated" : "Update password"}
        </Button>
      </div>
    </form>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium text-foreground">{children}</span>
    </div>
  );
}
