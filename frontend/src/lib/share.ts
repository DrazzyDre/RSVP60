import type { EventAdmin } from "./types";
import { formatDate } from "./utils";

type ShareEvent = Pick<
  EventAdmin,
  "title" | "name" | "event_date" | "event_time" | "venue_name"
>;

/**
 * Build a WhatsApp-ready invite message for an invite tree.
 *
 * The message intentionally contains only guest-safe details — event name,
 * date, venue and the token-based invite link. The invite tree name is NEVER
 * included, so the private allocation label is not leaked to guests.
 */
export function buildWhatsappMessage(
  event: ShareEvent | null | undefined,
  inviteUrl: string
): string {
  const title = event?.title || event?.name || "our celebration";
  const lines: string[] = [
    `You're warmly invited to ${title}.`,
    "",
    "Kindly RSVP using this private link:",
    inviteUrl,
    "",
  ];

  const dateStr = event?.event_date
    ? formatDate(event.event_date)
    : event?.event_time || "";
  if (dateStr) lines.push(`Date: ${dateStr}`);
  if (event?.venue_name) lines.push(`Venue: ${event.venue_name}`);

  lines.push("", "Thank you.");
  return lines.join("\n");
}

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "invite"
  );
}
