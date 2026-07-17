import type { EventAdmin } from "@/lib/types";

/**
 * Guided setup step model.
 *
 * The wizard is a guided *view* over the existing event + invite-tree +
 * readiness system — it is NOT a separate source of truth. There is no
 * `wizard_step` / `wizard_completed` persisted anywhere: step completion and
 * the best resume step are always DERIVED from the event's real persisted
 * state below.
 */

export type SetupStepKey =
  | "details"
  | "invitation"
  | "rsvp"
  | "branding"
  | "trees"
  | "review";

/** Imperative handle each step exposes so the wizard footer can drive saving. */
export interface SetupStepHandle {
  /** Persist this step. Resolves true on success (or when there's nothing to save). */
  save: () => Promise<boolean>;
  /**
   * Whether the step's local values differ from the last persisted values.
   * A successful save() must reset this to false. Steps with no local editable
   * state (Trees, Review — they persist through their own explicit actions)
   * always report false so navigation stays immediate.
   */
  isDirty: () => boolean;
}

/** Common props passed to every step body. */
export interface SetupStepProps {
  event: import("@/lib/types").EventAdmin;
  /** True while the wizard is saving — steps disable their inputs. */
  disabled?: boolean;
}

export interface SetupStepDef {
  key: SetupStepKey;
  /** Full heading shown in the step body. */
  title: string;
  /** Compact label for the progress indicator. */
  shortTitle: string;
  /** One-line description shown under the heading. */
  description: string;
  /** Whether "Skip for now" is offered (optional steps only). */
  optional: boolean;
}

export const SETUP_STEPS: SetupStepDef[] = [
  {
    key: "details",
    title: "Event details",
    shortTitle: "Details",
    description: "The essentials: what the event is and when it happens.",
    optional: false,
  },
  {
    key: "invitation",
    title: "Invitation details",
    shortTitle: "Invitation",
    description: "The message, venue and details your guests will see.",
    optional: true,
  },
  {
    key: "rsvp",
    title: "RSVP setup",
    shortTitle: "RSVP",
    description: "When RSVPs close and who gets notified.",
    optional: true,
  },
  {
    key: "branding",
    title: "Branding & flyer",
    shortTitle: "Branding",
    description: "Theme, colours and the flyer image guests will see.",
    optional: true,
  },
  {
    key: "trees",
    title: "Invite trees",
    shortTitle: "Trees",
    description: "Named groups with seat allocations and shareable links.",
    optional: true,
  },
  {
    key: "review",
    title: "Review & activate",
    shortTitle: "Review",
    description: "Check readiness, then deliberately go live.",
    optional: false,
  },
];

export const STEP_ORDER: SetupStepKey[] = SETUP_STEPS.map((s) => s.key);

export function getStep(key: SetupStepKey): SetupStepDef {
  return SETUP_STEPS.find((s) => s.key === key) ?? SETUP_STEPS[0];
}

export function isSetupStepKey(value: string | null | undefined): value is SetupStepKey {
  return !!value && STEP_ORDER.includes(value as SetupStepKey);
}

export function nextStep(key: SetupStepKey): SetupStepKey | null {
  const i = STEP_ORDER.indexOf(key);
  return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1] : null;
}

export function prevStep(key: SetupStepKey): SetupStepKey | null {
  const i = STEP_ORDER.indexOf(key);
  return i > 0 ? STEP_ORDER[i - 1] : null;
}

/**
 * Per-step completion derived ENTIRELY from persisted event state — never from
 * whether the user has visited a step. Kept intentionally close to the backend
 * readiness rules (title/date/venue/message/flyer/deadline/trees) so the wizard
 * and the readiness checklist agree.
 */
export function stepCompletion(event: EventAdmin): Record<SetupStepKey, boolean> {
  return {
    // Name is always set at creation; the event date is the essential detail.
    details: Boolean(event.event_date),
    // Invitation content: a venue plus some invitation copy.
    invitation: Boolean(event.venue_name) && Boolean(event.invite_message || event.description),
    // RSVP: a deadline is the persisted signal (other settings have defaults).
    rsvp: Boolean(event.rsvp_deadline),
    // Branding: a flyer image (upload or external URL). Theme always has a default.
    branding: Boolean(event.flyer_storage_path || event.flyer_url),
    // Trees: at least one invite tree exists.
    trees: event.tree_count >= 1,
    // Review is "complete" only once the event has been deliberately activated.
    review: event.status === "active",
  };
}

/**
 * The most useful step to resume at: the first incomplete step in priority
 * order (essential details → invitation → RSVP → branding → trees → review).
 * Falls back to review when everything is already complete.
 */
export function resumeStep(event: EventAdmin): SetupStepKey {
  const done = stepCompletion(event);
  for (const key of STEP_ORDER) {
    if (!done[key]) return key;
  }
  return "review";
}
