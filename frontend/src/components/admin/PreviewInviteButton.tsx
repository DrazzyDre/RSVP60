"use client";

import * as React from "react";
import { useCallback, useState } from "react";
import { ExternalLink, Eye, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { InviteTree } from "@/lib/types";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Opens the public invite experience for an event using a real invite-tree
 * link, so admins can preview exactly what guests see. If the event has no
 * invite tree yet, it explains that one must be created first (rather than
 * exposing anything internal). Prefers an *active* tree; otherwise falls back
 * to the first tree. The link always uses the current origin so the preview
 * opens on the same site the admin is already using.
 */
export function usePreviewInvite() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const preview = useCallback(
    async (eventId: string | null | undefined) => {
      if (!eventId) {
        toast.info("Select an event first to preview its invite.");
        return;
      }
      setLoading(true);
      try {
        const trees = await api.get<InviteTree[]>(
          `/api/admin/invite-trees?event_id=${eventId}`,
          true
        );
        if (trees.length === 0) {
          toast.info(
            "Create an invite tree first — the preview uses a real invite link."
          );
          return;
        }
        // Prefer a tree that can actually accept RSVPs so the preview matches
        // what guests see; fall back to an active/first tree otherwise.
        const tree =
          trees.find((t) => t.accepting_rsvps) ??
          trees.find((t) => t.status === "active") ??
          trees[0];
        const url = `${window.location.origin}/invite/${tree.token}`;
        window.open(url, "_blank", "noopener,noreferrer");
        // Warn if even the best tree can't accept RSVPs — the preview will show
        // the guest-facing "currently closed" state.
        if (!tree.accepting_rsvps) {
          toast.error(
            `Heads up: this invite is not accepting RSVPs (${tree.availability_label}). Guests currently see it as closed.`
          );
        }
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Could not open the invite preview."
        );
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  return { preview, loading };
}

export function PreviewInviteButton({
  eventId,
  label = "Preview invite",
  variant = "outline",
  size = "sm",
  className,
}: {
  eventId: string | null | undefined;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const { preview, loading } = usePreviewInvite();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => preview(eventId)}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : variant === "ghost" ? (
        <Eye className="h-4 w-4" />
      ) : (
        <ExternalLink className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
