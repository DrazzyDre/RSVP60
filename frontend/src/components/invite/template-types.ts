import type { EventPublic, InvitePublic } from "@/lib/types";
import type { InviteTheme } from "@/lib/theme";

/**
 * The single contract every invitation template renders against. The public
 * token page (and the admin live preview) resolve one template and hand it this
 * shape, so no template ever fetches data, evaluates availability, or owns RSVP
 * business logic — templates control presentation only.
 */
export interface InvitationTemplateProps {
  event: EventPublic;
  invite: InvitePublic;
  token: string;
  /** Resolved colour theme (palette derived from the event's preset + accent). */
  theme: InviteTheme;
  /** Already-resolved flyer URL ("" when the event has no flyer). */
  flyerUrl: string;
  /** True once a response has been recorded — templates drop the pre-RSVP prompt. */
  submitted: boolean;
  onSubmitted: () => void;
  /**
   * Admin preview mode: render a non-interactive RSVP placeholder instead of the
   * live form (no API calls). Never set on the public page.
   */
  preview?: boolean;
}
