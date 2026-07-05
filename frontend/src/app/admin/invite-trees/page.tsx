"use client";

import { LegacyEventRedirect } from "@/components/admin/LegacyEventRedirect";

/** Legacy route — Invite Trees now lives at /admin/e/[eventId]/invite-trees. */
export default function LegacyInviteTreesPage() {
  return <LegacyEventRedirect segment="/invite-trees" />;
}
