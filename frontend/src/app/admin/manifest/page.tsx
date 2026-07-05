"use client";

import { LegacyEventRedirect } from "@/components/admin/LegacyEventRedirect";

/** Legacy route — the manifest now lives at /admin/e/[eventId]/manifest. */
export default function LegacyManifestPage() {
  return <LegacyEventRedirect segment="/manifest" />;
}
