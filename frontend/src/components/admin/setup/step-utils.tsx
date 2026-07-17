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

/**
 * Shared dirty-state tracker for setup steps, so every step reports unsaved
 * changes the same way without duplicating field-comparison logic.
 *
 * A baseline snapshot of the step's editable values is taken on mount (so
 * loading initial values never reads as dirty) and replaced via `markClean()`
 * after a successful save. `isDirty()` shallow-compares the CURRENT values
 * against that baseline — comparing against what was actually persisted, not
 * against a possibly stale event prop, so a save always resets dirtiness even
 * if the surrounding event refresh lags or fails.
 *
 * Steps fully remount when the step or the event id changes, so a new mount
 * (new event, revisited step) always starts from a fresh, clean baseline —
 * Event A's edits can never leak into Event B.
 */
export function useStepDirty<T extends Record<string, string | boolean>>(values: T) {
  const baselineRef = React.useRef<T>(values);
  const valuesRef = React.useRef<T>(values);
  valuesRef.current = values;

  return React.useMemo(
    () => ({
      /** True when any tracked field differs from the last saved baseline. */
      isDirty: () => {
        const base = baselineRef.current;
        const current = valuesRef.current;
        return Object.keys(current).some((key) => current[key] !== base[key]);
      },
      /** Call after a successful save: the current values become the baseline. */
      markClean: () => {
        baselineRef.current = valuesRef.current;
      },
    }),
    []
  );
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
