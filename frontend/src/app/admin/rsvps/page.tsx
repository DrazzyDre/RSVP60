"use client";

import { LegacyEventRedirect } from "@/components/admin/LegacyEventRedirect";

/**
 * Legacy route — RSVPs now lives at /admin/e/[eventId]/rsvps. The redirect
 * preserves the query string so ?status= deep links keep working.
 */
export default function LegacyRsvpsPage() {
  return <LegacyEventRedirect segment="/rsvps" />;
}
