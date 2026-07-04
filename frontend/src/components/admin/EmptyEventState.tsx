"use client";

import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { useCanEdit } from "@/components/admin/auth-context";
import { Button } from "@/components/ui/button";

export function EmptyEventState() {
  const canEdit = useCanEdit();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-dashed bg-white p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-royal/10 text-royal">
        <CalendarPlus className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-serif text-xl font-semibold text-royal">
        No event selected
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {canEdit
          ? "Create your first event to start building invite trees and collecting RSVPs. You can manage multiple events and switch between them anytime."
          : "No event is selected yet. Ask an owner or admin to create one, then pick it from the event switcher."}
      </p>
      {canEdit && (
        <Link href="/admin/events/new" className="mt-5">
          <Button>
            <CalendarPlus className="h-4 w-4" /> Create an event
          </Button>
        </Link>
      )}
    </div>
  );
}
