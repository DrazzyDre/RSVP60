"use client";

import * as React from "react";
import { useRef } from "react";
import { Check, Sparkles } from "lucide-react";
import type { EventType, ThemePreset } from "@/lib/types";
import {
  ORDERED_TEMPLATES,
  isRecommendedFor,
} from "@/lib/invitation-templates";
import { cn } from "@/lib/utils";

/**
 * Visual template gallery used by the wizard Branding step and the event edit
 * form. Renders each template as a card with a structural miniature (not just a
 * colour swatch), name, description, suitable event types, an optional
 * "Recommended for this event" hint, and a selected state.
 *
 * Implemented as an accessible radiogroup: roving tabindex, arrow-key
 * navigation, Space/Enter to select, and per-card aria labels.
 */
export function TemplateGallery({
  value,
  onChange,
  eventType,
  disabled,
}: {
  value: ThemePreset;
  onChange: (id: ThemePreset) => void;
  eventType?: EventType | null;
  disabled?: boolean;
}) {
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const ids = ORDERED_TEMPLATES.map((t) => t.id);
  const currentIndex = Math.max(0, ids.indexOf(value));

  function move(delta: number) {
    const next = (currentIndex + delta + ids.length) % ids.length;
    onChange(ids[next]);
    cardRefs.current[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Invitation template"
      onKeyDown={onKeyDown}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {ORDERED_TEMPLATES.map((t, i) => {
        const selected = t.id === value;
        const recommended = isRecommendedFor(t.id, eventType);
        const Mini = t.Mini;
        return (
          <button
            key={t.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(t.id)}
            aria-label={`${t.name} template. ${t.description}${
              recommended ? " Recommended for this event." : ""
            }`}
            className={cn(
              "flex flex-col rounded-xl border bg-white p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              selected
                ? "border-royal ring-2 ring-royal/30"
                : "border-input hover:border-royal/40"
            )}
          >
            <div className="relative">
              <Mini className="h-24 w-full overflow-hidden rounded-lg border" />
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-royal text-white shadow">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{t.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.previewLabel}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t.description}
            </p>
            {recommended && (
              <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-dark">
                <Sparkles className="h-3 w-3" /> Recommended for this event
              </span>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              {t.suitableFor.join(" · ")}
            </p>
          </button>
        );
      })}
    </div>
  );
}
