"use client";

import * as React from "react";
import { useEffect, useId, useRef } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Three-way unsaved-changes confirmation for the setup wizard.
 *
 * Shown ONLY when the user tries to leave a dirty step through Back, Skip for
 * now, a progress-step jump or the Exit / finish-later actions — never for
 * "Save & continue" / "Save & exit" (those already save first) and never on a
 * clean step. The wizard shell owns the pending navigation target; this dialog
 * just presents the choice.
 *
 * Follows the workspace's dialog conventions (see ConfirmProvider): modal
 * overlay, accessible title + description, focus moves into the dialog, Tab is
 * trapped, Escape / backdrop click choose "Stay here". While a save is in
 * flight all choices are disabled so navigation can't race the request.
 */
export function UnsavedChangesDialog({
  saving,
  onSave,
  onDiscard,
  onStay,
}: {
  /** True while "Save changes" is persisting the current step. */
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const panelRef = useRef<HTMLDivElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the primary (least destructive, most likely) action on open.
  useEffect(() => {
    saveBtnRef.current?.focus();
  }, []);

  // Escape = Stay here (unless saving); Tab stays inside the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!saving) onStay();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>("button:not([disabled])")
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [saving, onStay]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 print:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onStay();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <TriangleAlert className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-serif text-lg font-bold text-royal">
              Unsaved changes
            </h2>
            <p id={descId} className="mt-1.5 text-sm text-muted-foreground">
              You have changes on this step that have not been saved. Save them,
              discard them, or stay here and keep editing.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="ghost" onClick={onStay} disabled={saving}>
            Stay here
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={saving}>
            Discard changes
          </Button>
          <Button ref={saveBtnRef} onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {saving ? "Saving your changes before leaving this step." : ""}
        </span>
      </div>
    </div>
  );
}
