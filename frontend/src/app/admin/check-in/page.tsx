"use client";

import { LegacyEventRedirect } from "@/components/admin/LegacyEventRedirect";

/**
 * Legacy route — Check-in now lives at /admin/e/[eventId]/check-in. The
 * redirect preserves the query string so ?token= deep links (printed guest QR
 * codes from before 6.2) still resolve against the last-opened event.
 */
export default function LegacyCheckInPage() {
  return <LegacyEventRedirect segment="/check-in" />;
}
