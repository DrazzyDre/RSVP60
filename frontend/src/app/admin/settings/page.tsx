"use client";

import { LegacyEventRedirect } from "@/components/admin/LegacyEventRedirect";

/** Legacy route — Event Settings now lives at /admin/e/[eventId]/settings. */
export default function LegacySettingsPage() {
  return <LegacyEventRedirect segment="/settings" />;
}
