"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ShieldAlert } from "lucide-react";
import type { EventAdmin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { EventForm, type EventSaveMeta } from "@/components/admin/EventForm";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NewEventPage() {
  const router = useRouter();
  const canEdit = useCanEdit();
  const { refreshEvents, setSelectedEventId } = useEvents();
  const toast = useToast();

  async function handleSaved(saved: EventAdmin, meta?: EventSaveMeta) {
    // The new event immediately becomes the selected/current workspace: we
    // navigate to its canonical scoped Settings route, and the workspace layout
    // adopts the URL's event id (updating the switcher + recents).
    await refreshEvents();
    setSelectedEventId(saved.id);
    if (meta?.flyerUploadFailed) {
      // The event WAS created and is kept + selected — only the flyer failed.
      // Send them to Settings where the flyer can be retried (no duplicate event).
      toast.error(
        `“${saved.name}” was created, but the flyer couldn’t be uploaded${
          meta.flyerUploadError ? ` (${meta.flyerUploadError})` : ""
        }. Add it from the event’s flyer section below.`
      );
    } else {
      toast.success(`“${saved.name}” created — finish setting it up below.`);
    }
    router.push(`/admin/e/${saved.id}/settings`);
  }

  if (!canEdit) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-12 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium text-foreground">You can view events only</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Creating events requires an owner or admin account. Ask an owner if you
            need access.
          </p>
          <Link href="/admin/events" className="mt-5 inline-block">
            <Button variant="outline">Back to events</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Breadcrumbs for orientation */}
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/admin" className="hover:text-royal hover:underline">
              Dashboard
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <li>
            <Link href="/admin/events" className="hover:text-royal hover:underline">
              Events
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <li aria-current="page" className="font-medium text-foreground">
            New event
          </li>
        </ol>
      </nav>

      <div>
        <h1 className="font-serif text-2xl font-bold text-royal">Create event</h1>
        <p className="text-sm text-muted-foreground">
          Fill in the essentials to create a draft. It becomes your selected event
          and you can complete the rest (flyer, invite trees) afterwards.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <EventForm
            event={null}
            onSaved={handleSaved}
            onCancel={() => router.push("/admin/events")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
