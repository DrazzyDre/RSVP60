"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type { EventAdmin } from "@/lib/types";
import { Label } from "@/components/ui/label";

/** Persist a partial event update through the canonical event-update contract. */
export function patchEvent(
  eventId: string,
  body: Record<string, unknown>
): Promise<EventAdmin> {
  return api.patch<EventAdmin>(`/api/admin/events/${eventId}`, body, true);
}

/** Labelled field wrapper matching the create/edit form's field layout. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const hintId = hint && htmlFor ? `${htmlFor}-hint` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Consistent, accessible inline error banner for a step. */
export function StepError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </p>
  );
}
