"use client";

import { LegacyEventRedirect } from "@/components/admin/LegacyEventRedirect";

/** Legacy route — Communications now lives at /admin/e/[eventId]/communications. */
export default function LegacyCommunicationsPage() {
  return <LegacyEventRedirect segment="/communications" />;
}
