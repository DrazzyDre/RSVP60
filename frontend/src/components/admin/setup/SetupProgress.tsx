"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SETUP_STEPS,
  STEP_ORDER,
  type SetupStepKey,
} from "@/components/admin/setup/steps";

/**
 * Premium setup progress indicator.
 *
 * Desktop: a horizontal numbered stepper; completed steps show a check, the
 * current step is ringed, upcoming steps are muted. Mobile: a compact
 * "Step X of N" line, the current title, and a progress bar.
 *
 * Completion reflects real persisted state (passed in), not merely visited
 * steps. Colour is never the only signal — completed uses a check icon + an
 * sr-only "completed" label, and the current step uses aria-current + a ring.
 */
export function SetupProgress({
  currentKey,
  completion,
  navigable,
  onNavigate,
}: {
  currentKey: SetupStepKey;
  completion: Record<SetupStepKey, boolean>;
  /** Whether a given step can be navigated to (defaults to false). */
  navigable?: (key: SetupStepKey) => boolean;
  onNavigate?: (key: SetupStepKey) => void;
}) {
  const currentIndex = STEP_ORDER.indexOf(currentKey);
  const total = SETUP_STEPS.length;
  const completedCount = STEP_ORDER.filter((k) => completion[k]).length;
  const current = SETUP_STEPS[currentIndex] ?? SETUP_STEPS[0];

  function go(key: SetupStepKey) {
    if (key === currentKey) return;
    if (navigable?.(key) && onNavigate) onNavigate(key);
  }

  return (
    <nav aria-label="Setup progress">
      {/* Mobile: compact summary + progress bar */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-royal">
            Step {currentIndex + 1} of {total}
          </p>
          <p className="text-xs text-muted-foreground">
            {completedCount} of {total} complete
          </p>
        </div>
        <p className="mt-0.5 text-base font-semibold text-foreground">{current.title}</p>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuetext={`Step ${currentIndex + 1} of ${total}: ${current.title}`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-royal to-gold transition-all motion-reduce:transition-none"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: horizontal numbered stepper */}
      <ol className="hidden items-center md:flex">
        {SETUP_STEPS.map((step, i) => {
          const isCurrent = step.key === currentKey;
          const isComplete = completion[step.key];
          const canGo = !isCurrent && Boolean(navigable?.(step.key)) && Boolean(onNavigate);
          const stateLabel = isComplete ? "completed" : isCurrent ? "current step" : "not started";

          const circle = (
            <span
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors motion-reduce:transition-none",
                isComplete && "border-royal bg-royal text-white",
                isCurrent && !isComplete && "border-royal bg-white text-royal ring-2 ring-royal/25",
                !isComplete && !isCurrent && "border-input bg-white text-muted-foreground"
              )}
            >
              {isComplete ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
          );

          const label = (
            <span
              className={cn(
                "ml-2 whitespace-nowrap text-sm",
                isCurrent ? "font-semibold text-royal" : "font-medium text-muted-foreground"
              )}
            >
              {step.shortTitle}
            </span>
          );

          return (
            <li
              key={step.key}
              className={cn("flex items-center", i < SETUP_STEPS.length - 1 && "flex-1")}
              aria-current={isCurrent ? "step" : undefined}
            >
              {canGo ? (
                <button
                  type="button"
                  onClick={() => go(step.key)}
                  className="flex items-center rounded-lg px-1 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  aria-label={`Go to step ${i + 1}, ${step.shortTitle}, ${stateLabel}`}
                >
                  {circle}
                  {label}
                  <span className="sr-only">{stateLabel}</span>
                </button>
              ) : (
                <span className="flex items-center px-1 py-1">
                  {circle}
                  {label}
                  <span className="sr-only">{stateLabel}</span>
                </span>
              )}
              {i < SETUP_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 h-px flex-1 transition-colors motion-reduce:transition-none",
                    isComplete ? "bg-royal/40" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
