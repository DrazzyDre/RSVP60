"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, LogOut, ShieldAlert } from "lucide-react";
import type { EventAdmin } from "@/lib/types";
import { useUnsavedChanges } from "@/lib/hooks";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { SetupProgress } from "@/components/admin/setup/SetupProgress";
import { UnsavedChangesDialog } from "@/components/admin/setup/UnsavedChangesDialog";
import {
  getStep,
  isSetupStepKey,
  nextStep,
  prevStep,
  resumeStep,
  stepCompletion,
  type SetupStepHandle,
  type SetupStepKey,
} from "@/components/admin/setup/steps";
import { StepDetails } from "@/components/admin/setup/StepDetails";
import { StepInvitation } from "@/components/admin/setup/StepInvitation";
import { StepRsvp } from "@/components/admin/setup/StepRsvp";
import { StepBranding } from "@/components/admin/setup/StepBranding";
import { StepTrees } from "@/components/admin/setup/StepTrees";
import { StepReview } from "@/components/admin/setup/StepReview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

/**
 * The guided setup shell for an existing (draft) event. The event id in the URL
 * is the source of truth; the current step lives in a `?step=` query param so a
 * refresh keeps the same step and browser back/forward move between steps.
 *
 * There is no persisted wizard state — completion and the resume step are always
 * derived from the event's real data. Each step saves through the existing event
 * / invite-tree / flyer APIs.
 */
export function SetupWizard() {
  const { selectedEvent } = useEvents();
  const canEdit = useCanEdit();

  // The scoped workspace layout guarantees a valid, selected event before this
  // renders; guard anyway so we never read stale/absent data.
  if (!selectedEvent) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="py-12 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-medium text-foreground">Setup is view-only for your role</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Editing event setup requires an owner or admin account.
          </p>
          <Link href={`/admin/e/${selectedEvent.id}`} className="mt-5 inline-block">
            <Button variant="outline">Go to event overview</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Key by event id so switching events always remounts the wizard (and every
  // step), guaranteeing Event A's local edits/dirty state never reach Event B.
  return <WizardBody key={selectedEvent.id} event={selectedEvent} />;
}

/** Where a guarded navigation wants to go once the dirty step is resolved. */
type NavTarget = { kind: "step"; step: SetupStepKey } | { kind: "exit" };

function WizardBody({ event }: { event: EventAdmin }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { refreshEvents } = useEvents();

  const stepRef = useRef<SetupStepHandle>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState(false);
  // A non-null target means the unsaved-changes confirmation is open, holding
  // exactly ONE intended destination (Back / Skip / step jump / Exit).
  const [pendingNav, setPendingNav] = useState<NavTarget | null>(null);
  // The control that initiated the guarded navigation, so "Stay here" (and a
  // failed save) can put focus back where the user was.
  const navTriggerRef = useRef<Element | null>(null);

  // Warn on refresh / tab close while the current step is dirty. Checked
  // lazily at unload time via the step handle, so a successful save or an
  // intentional discard clears the warning with no extra bookkeeping. Never
  // active in viewer mode (WizardBody only mounts for owner/admin).
  useUnsavedChanges(() => Boolean(stepRef.current?.isDirty()));

  const rawStep = searchParams.get("step");
  const effectiveStep: SetupStepKey = isSetupStepKey(rawStep) ? rawStep : resumeStep(event);

  // Canonicalise the URL when the step is missing/invalid (replace so the bare
  // /setup entry doesn't leave a dead history entry).
  useEffect(() => {
    if (rawStep !== effectiveStep) {
      router.replace(`/admin/e/${event.id}/setup?step=${effectiveStep}`);
    }
  }, [event.id, rawStep, effectiveStep, router]);

  // Move focus to the step heading after each step change.
  useEffect(() => {
    headingRef.current?.focus();
  }, [effectiveStep]);

  const handleTreesChanged = useCallback(() => {
    // Keep readiness/progress accurate after a tree is created or edited.
    refreshEvents().catch(() => {});
  }, [refreshEvents]);

  const handleActivated = useCallback(() => {
    refreshEvents().catch(() => {});
  }, [refreshEvents]);

  const step = getStep(effectiveStep);
  const completion = stepCompletion(event);
  const nk = nextStep(effectiveStep);
  const pk = prevStep(effectiveStep);
  const isReview = effectiveStep === "review";

  function goTo(key: SetupStepKey) {
    router.push(`/admin/e/${event.id}/setup?step=${key}`);
  }

  function navigate(target: NavTarget) {
    if (target.kind === "step") goTo(target.step);
    else router.push(`/admin/e/${event.id}`);
  }

  /**
   * Single guard every leave-this-step action routes through (Back, Skip for
   * now, progress-step jumps, review's "Go to step", Exit, Finish setup).
   * Clean steps navigate immediately; dirty steps open the Save / Discard /
   * Stay confirmation with the intended target stored. "Save & continue" and
   * "Save & exit" intentionally bypass this — they already save first.
   */
  function requestNavigation(target: NavTarget) {
    if (saving || pendingNav) return; // no overlap with a pending save/dialog
    if (stepRef.current?.isDirty()) {
      navTriggerRef.current = document.activeElement;
      setPendingNav(target);
    } else {
      navigate(target);
    }
  }

  /** Focus back to whatever started the navigation (fallback: step heading). */
  function restoreNavFocus() {
    const el = navTriggerRef.current;
    if (el instanceof HTMLElement && el.isConnected) el.focus();
    else headingRef.current?.focus();
  }

  async function confirmSaveAndGo() {
    if (!pendingNav || saving) return;
    const target = pendingNav;
    const ok = await persistCurrent();
    setPendingNav(null);
    if (ok) {
      navigate(target);
    } else {
      // Stay on the step: values are preserved and the step's inline error
      // (role="alert") explains what went wrong.
      restoreNavFocus();
    }
  }

  function confirmDiscardAndGo() {
    if (!pendingNav || saving) return;
    const target = pendingNav;
    setPendingNav(null);
    // Leave without persisting — the step remounts from real backend state
    // when revisited, so the discarded values are truly gone.
    navigate(target);
  }

  function confirmStay() {
    if (saving) return;
    setPendingNav(null);
    restoreNavFocus();
  }

  async function persistCurrent(): Promise<boolean> {
    if (!stepRef.current) return true;
    setSaving(true);
    try {
      const ok = await stepRef.current.save();
      if (ok) await refreshEvents().catch(() => {});
      return ok;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndContinue() {
    if (saving || pendingNav) return;
    const ok = await persistCurrent();
    if (ok && nk) goTo(nk);
  }

  async function saveAndExit() {
    if (saving || pendingNav) return;
    const ok = await persistCurrent();
    if (!ok) return;
    if (event.status === "draft") {
      toast.success(`Setup saved — “${event.name}” is still a draft. Continue any time.`);
    }
    router.push(`/admin/e/${event.id}`);
  }

  function renderStep() {
    switch (effectiveStep) {
      case "details":
        return <StepDetails ref={stepRef} event={event} disabled={saving} />;
      case "invitation":
        return <StepInvitation ref={stepRef} event={event} disabled={saving} />;
      case "rsvp":
        return <StepRsvp ref={stepRef} event={event} disabled={saving} />;
      case "branding":
        return <StepBranding ref={stepRef} event={event} disabled={saving} />;
      case "trees":
        return <StepTrees ref={stepRef} event={event} onTreesChanged={handleTreesChanged} />;
      case "review":
        return (
          <StepReview
            ref={stepRef}
            event={event}
            canEdit
            onNavigate={(key) => requestNavigation({ kind: "step", step: key })}
            onActivated={handleActivated}
          />
        );
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Guided setup
          </p>
          <h1 className="truncate font-serif text-2xl font-bold text-royal" title={event.name}>
            {event.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Your event stays a private
            <Badge status="paused">draft</Badge>
            until you activate it.
          </p>
        </div>
        <Link
          href={`/admin/e/${event.id}`}
          onClick={(e) => {
            // Guard the "finish later" exit: a dirty step gets the same
            // Save / Discard / Stay choice instead of silently losing edits.
            if (saving || pendingNav || stepRef.current?.isDirty()) {
              e.preventDefault();
              requestNavigation({ kind: "exit" });
            }
          }}
        >
          <Button variant="ghost" size="sm">
            <LogOut className="h-4 w-4" /> Exit
          </Button>
        </Link>
      </div>

      {/* Progress */}
      <div className="rounded-xl border bg-white p-4 sm:p-5">
        <SetupProgress
          currentKey={effectiveStep}
          completion={completion}
          navigable={() => !saving && !pendingNav}
          onNavigate={(key) => requestNavigation({ kind: "step", step: key })}
        />
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="font-serif text-xl font-bold text-royal outline-none"
            >
              {step.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
          </div>
          {renderStep()}
        </CardContent>
      </Card>

      {/* Footer nav — sticky within the scroll area so it stays reachable. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-xl sm:border sm:bg-muted/40 sm:px-4">
        {pk ? (
          <Button
            variant="outline"
            onClick={() => requestNavigation({ kind: "step", step: pk })}
            disabled={saving}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        ) : (
          <span />
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {step.optional && nk && (
            <Button
              variant="ghost"
              onClick={() => requestNavigation({ kind: "step", step: nk })}
              disabled={saving}
            >
              Skip for now
            </Button>
          )}
          {!isReview && (
            <Button variant="outline" onClick={saveAndExit} disabled={saving}>
              Save &amp; exit
            </Button>
          )}
          {nk ? (
            <Button onClick={saveAndContinue} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save & continue"}
            </Button>
          ) : (
            <Button onClick={() => requestNavigation({ kind: "exit" })} disabled={saving}>
              <Check className="h-4 w-4" /> Finish setup
            </Button>
          )}
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {saving ? "Saving your changes." : ""}
        </span>
      </div>

      {/* Unsaved-changes guard: Save / Discard / Stay for the pending target. */}
      {pendingNav && (
        <UnsavedChangesDialog
          saving={saving}
          onSave={confirmSaveAndGo}
          onDiscard={confirmDiscardAndGo}
          onStay={confirmStay}
        />
      )}
    </div>
  );
}
