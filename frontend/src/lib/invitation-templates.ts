import type { ComponentType } from "react";
import type { EventType, ThemePreset } from "@/lib/types";
import type { InvitationTemplateProps } from "@/components/invite/template-types";
import { ElegantRender, ElegantMini } from "@/components/invite/templates/ElegantTemplate";
import { ClassicRender, ClassicMini } from "@/components/invite/templates/ClassicTemplate";
import { JoyfulRender, JoyfulMini } from "@/components/invite/templates/JoyfulTemplate";
import { MinimalRender, MinimalMini } from "@/components/invite/templates/MinimalTemplate";
import { FormalRender, FormalMini } from "@/components/invite/templates/FormalTemplate";

/**
 * Central invitation-template registry (Phase 8D).
 *
 * The persisted `theme_preset` on the event IS the template selector — there is
 * no new field. Each stable preset id maps to one complete layout family. The
 * public token page and the admin preview resolve exactly one template via
 * {@link resolveTemplate} and render it through the shared
 * {@link InvitationTemplateProps} contract, so template branching never leaks
 * into the invite route.
 */
export interface InvitationTemplateDefinition {
  /** Stable identifier — equals the persisted `theme_preset`. */
  id: ThemePreset;
  name: string;
  description: string;
  /** Human-facing event types this layout suits (for the gallery). */
  suitableFor: string[];
  /** Event types for which this template is recommended (non-blocking hint). */
  recommendedTypes: EventType[];
  /** Short tag shown on the gallery card. */
  previewLabel: string;
  /** Full public-invitation renderer. */
  Render: ComponentType<InvitationTemplateProps>;
  /** Lightweight structural miniature for the gallery (CSS shapes only). */
  Mini: ComponentType<{ className?: string }>;
}

export const DEFAULT_TEMPLATE_ID: ThemePreset = "elegant";

export const INVITATION_TEMPLATES: Record<ThemePreset, InvitationTemplateDefinition> = {
  elegant: {
    id: "elegant",
    name: "Elegant",
    description: "Refined editorial layout with graceful serif type and a framed hero.",
    suitableFor: ["Weddings", "Anniversaries", "Formal birthdays", "Dinners"],
    recommendedTypes: ["wedding", "anniversary", "dinner"],
    previewLabel: "Editorial",
    Render: ElegantRender,
    Mini: ElegantMini,
  },
  classic: {
    id: "classic",
    name: "Classic",
    description: "A timeless, framed invitation card with clear host and date hierarchy.",
    suitableFor: ["Birthdays", "Family celebrations", "Anniversaries", "Traditional gatherings"],
    recommendedTypes: ["birthday", "anniversary", "wedding", "church"],
    previewLabel: "Framed card",
    Render: ClassicRender,
    Mini: ClassicMini,
  },
  joyful: {
    id: "joyful",
    name: "Joyful",
    description: "Energetic and celebratory, with playful accents and lively detail chips.",
    suitableFor: ["Birthdays", "Celebrations", "Family & kids", "Social gatherings"],
    recommendedTypes: ["birthday"],
    previewLabel: "Celebratory",
    Render: JoyfulRender,
    Mini: JoyfulMini,
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Restrained and modern — strong type, generous whitespace, no clutter.",
    suitableFor: ["Dinners", "Private gatherings", "Professional events", "Modern celebrations"],
    recommendedTypes: ["dinner", "conference", "memorial"],
    previewLabel: "Whitespace",
    Render: MinimalRender,
    Mini: MinimalMini,
  },
  formal: {
    id: "formal",
    name: "Formal",
    description: "Dignified and structured, with a strong date and location hierarchy.",
    suitableFor: ["Memorials", "Church events", "Conferences", "Ceremonies"],
    recommendedTypes: ["memorial", "funeral", "church", "conference"],
    previewLabel: "Ceremonial",
    Render: FormalRender,
    Mini: FormalMini,
  },
};

/** Registry entries in a deliberate gallery display order. */
export const ORDERED_TEMPLATES: InvitationTemplateDefinition[] = [
  INVITATION_TEMPLATES.elegant,
  INVITATION_TEMPLATES.classic,
  INVITATION_TEMPLATES.joyful,
  INVITATION_TEMPLATES.minimal,
  INVITATION_TEMPLATES.formal,
];

/**
 * Resolve a persisted theme value to a template. Null, empty, unknown, legacy
 * or malformed values fall back safely to the default template — the public
 * invitation must never crash on an unsupported theme.
 */
export function resolveTemplate(
  themePreset: string | null | undefined
): InvitationTemplateDefinition {
  if (themePreset && Object.prototype.hasOwnProperty.call(INVITATION_TEMPLATES, themePreset)) {
    return INVITATION_TEMPLATES[themePreset as ThemePreset];
  }
  return INVITATION_TEMPLATES[DEFAULT_TEMPLATE_ID];
}

/** True when the given theme value is a known template id (not a fallback). */
export function isKnownTemplate(themePreset: string | null | undefined): boolean {
  return (
    !!themePreset &&
    Object.prototype.hasOwnProperty.call(INVITATION_TEMPLATES, themePreset)
  );
}

/** Whether a template is recommended for an event type (non-blocking hint). */
export function isRecommendedFor(
  id: ThemePreset,
  eventType: EventType | null | undefined
): boolean {
  if (!eventType) return false;
  return INVITATION_TEMPLATES[id].recommendedTypes.includes(eventType);
}
