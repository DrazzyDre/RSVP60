"use client";

import * as React from "react";
import { forwardRef, useId, useImperativeHandle, useState } from "react";
import { ApiError } from "@/lib/api";
import { BACKGROUND_PRESETS } from "@/lib/event-options";
import type { BackgroundPreset, ThemePreset } from "@/lib/types";
import type { SetupStepHandle, SetupStepProps } from "@/components/admin/setup/steps";
import { Field, StepError, patchEvent } from "@/components/admin/setup/step-utils";
import { FlyerUpload } from "@/components/admin/EventForm";
import { TemplateGallery } from "@/components/admin/TemplateGallery";
import { InvitationPreview } from "@/components/admin/InvitationPreview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * Step 4: invitation template + branding + the flyer. The template is the
 * persisted `theme_preset`; the gallery + live preview reflect the current
 * (possibly unsaved) selection, and everything saves through the event-update
 * contract. The flyer reuses the shared FlyerUpload component.
 */
export const StepBranding = forwardRef<SetupStepHandle, SetupStepProps>(
  function StepBranding({ event, disabled }, ref) {
    const uid = useId();
    const [theme, setTheme] = useState<ThemePreset>(event.theme_preset);
    const [background, setBackground] = useState<BackgroundPreset>(event.background_preset);
    const [accent, setAccent] = useState(event.accent_color);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        async save() {
          setError(null);
          try {
            await patchEvent(event.id, {
              theme_preset: theme,
              background_preset: background,
              accent_color: accent,
            });
            return true;
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not save branding.");
            return false;
          }
        },
      }),
      [event.id, theme, background, accent]
    );

    return (
      <div className="space-y-5">
        {/* Template gallery */}
        <div className="space-y-2">
          <Label>Invitation template</Label>
          <TemplateGallery
            value={theme}
            onChange={setTheme}
            eventType={event.event_type}
            disabled={disabled}
          />
        </div>

        {/* Background + accent */}
        <fieldset disabled={disabled} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Background style" htmlFor={`${uid}-bg`}>
            <Select
              id={`${uid}-bg`}
              value={background}
              onChange={(e) => setBackground(e.target.value as BackgroundPreset)}
            >
              {BACKGROUND_PRESETS.map((b) => (
                <option key={b.value || "default"} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Accent colour (optional)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Accent colour"
                value={accent || "#1E2A6B"}
                onChange={(e) => setAccent(e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-lg border border-input bg-white p-1"
              />
              {accent ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAccent("")}>
                  Reset
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Theme default</span>
              )}
            </div>
          </Field>
        </fieldset>

        {/* Live preview of the selected template */}
        <InvitationPreview
          event={event}
          templateId={theme}
          accentColor={accent}
          background={background}
        />

        {/* Flyer */}
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <Label className="text-sm font-semibold text-royal">Event flyer / image</Label>
          <p className="text-xs text-muted-foreground">
            Uploads immediately to the event. Duplicated events never carry a flyer
            across — add one here.
          </p>
          <FlyerUpload key={event.id} event={event} />
        </div>
        <StepError error={error} />
      </div>
    );
  }
);
