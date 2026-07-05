"use client";

import { LegacyEventRedirect } from "@/components/admin/LegacyEventRedirect";

/**
 * /admin — workspace resolver. The dashboard now lives at the canonical
 * event-scoped route /admin/e/[eventId]; this entry point (used by login and
 * old bookmarks) forwards to the last-opened event's overview, or to the
 * Events page when no event exists yet.
 */
export default function AdminIndexPage() {
  return <LegacyEventRedirect segment="" />;
}
