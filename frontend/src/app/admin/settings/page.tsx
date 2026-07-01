"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, Mail, Shield, User } from "lucide-react";
import { api } from "@/lib/api";
import type { Admin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eventTypeLabel } from "@/lib/utils";

export default function SettingsPage() {
  const { selectedEvent } = useEvents();
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About RSVP60</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            RSVP60 is a reusable, event-aware invite &amp; RSVP platform. Each event
            has its own invite trees, seat allocations and RSVPs.
          </p>
          <p>
            Admin accounts are provisioned via the backend seed script. Contact your
            system administrator to add or remove admins.
          </p>
        </CardContent>
      </Card>
    </div>
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
