"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarPlus,
  ClipboardList,
  Eye,
  ListTree,
  Loader2,
  UserCheck,
  Users,
} from "lucide-react";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { usePreviewInvite } from "@/components/admin/PreviewInviteButton";
import { cn } from "@/lib/utils";

/**
 * A focused set of shortcuts on the dashboard. Actions that operate on an event
 * use the currently selected one; when nothing is selected they are disabled
 * with guidance. Create actions are hidden from viewers (who cannot mutate).
 */
export function QuickActions() {
  const { selectedEventId } = useEvents();
  const canEdit = useCanEdit();
  const { preview, loading: previewLoading } = usePreviewInvite();
  const hasEvent = Boolean(selectedEventId);
  // Canonical workspace routes for the selected event.
  const base = `/admin/e/${selectedEventId}`;

  return (
    <div>
      <h2 className="mb-3 font-serif text-lg font-semibold text-royal">
        Quick actions
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {canEdit && (
          <ActionTile
            href="/admin/events/new"
            icon={<CalendarPlus className="h-5 w-5" />}
            label="Create event"
          />
        )}
        {canEdit && (
          <ActionTile
            href={`${base}/invite-trees`}
            icon={<ListTree className="h-5 w-5" />}
            label="Create invite tree"
            disabled={!hasEvent}
            disabledHint="Select an event first"
          />
        )}
        <ActionTile
          href={`${base}/rsvps`}
          icon={<Users className="h-5 w-5" />}
          label="View RSVPs"
          disabled={!hasEvent}
          disabledHint="Select an event first"
        />
        <ActionTile
          icon={
            previewLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Eye className="h-5 w-5" />
            )
          }
          label="Preview invite"
          onClick={() => preview(selectedEventId)}
          disabled={!hasEvent || previewLoading}
          disabledHint="Select an event first"
        />
        <ActionTile
          href={`${base}/check-in`}
          icon={<UserCheck className="h-5 w-5" />}
          label="Open check-in"
          disabled={!hasEvent}
          disabledHint="Select an event first"
        />
        <ActionTile
          href={`${base}/manifest`}
          icon={<ClipboardList className="h-5 w-5" />}
          label="Guest manifest"
          disabled={!hasEvent}
          disabledHint="Select an event first"
        />
      </div>
    </div>
  );
}

function ActionTile({
  href,
  onClick,
  icon,
  label,
  disabled,
  disabledHint,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const base =
    "flex h-full flex-col items-center justify-center gap-2 rounded-xl border bg-white p-4 text-center text-sm font-medium text-foreground transition-colors";
  const enabled = "hover:border-royal/40 hover:bg-royal/5 hover:text-royal";
  const off = "cursor-not-allowed opacity-50";
  const iconWrap = (
    <>
      <span className="text-royal">{icon}</span>
      <span>{label}</span>
    </>
  );

  if (disabled) {
    return (
      <div
        className={cn(base, off)}
        aria-disabled="true"
        title={disabledHint ?? undefined}
      >
        {iconWrap}
      </div>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cn(base, enabled)}>
        {iconWrap}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(base, enabled)}>
      {iconWrap}
    </button>
  );
}
