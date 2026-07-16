"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Image as ImageIcon,
  Layers,
  ListTree,
  Mail,
} from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardSummary, EventAdmin, NotificationPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type Tone = "error" | "warning" | "info";

interface HealthItem {
  key: string;
  tone: Tone;
  icon: React.ElementType;
  title: string;
  message: string;
  href: string;
}

const TONE_STYLES: Record<Tone, { row: string; icon: string }> = {
  error: { row: "border-red-200 bg-red-50/70 hover:bg-red-50", icon: "text-red-600" },
  warning: {
    row: "border-amber-200 bg-amber-50/70 hover:bg-amber-50",
    icon: "text-amber-600",
  },
  info: { row: "border-input bg-white hover:bg-muted/60", icon: "text-royal" },
};

/**
 * Host-facing "Attention needed" command centre for the selected event.
 *
 * Surfaces the most important UNRESOLVED issues from data already on the
 * dashboard (readiness, capacity, waitlist, missing setup) plus a lightweight
 * count of unresolved delivery/config error notifications. It is deliberately a
 * concise triage list — not a duplicate of the full notifications page.
 */
export function EventHealthPanel({
  event,
  summary,
  base,
}: {
  event: EventAdmin;
  summary: DashboardSummary;
  base: string;
}) {
  const [errorIssues, setErrorIssues] = useState(0);

  // One small query for unresolved (unread) error-severity notifications scoped
  // to this event — surfaces failed emails / storage config problems.
  useEffect(() => {
    let active = true;
    setErrorIssues(0);
    const q = `?event_id=${event.id}&include_platform=false&severity=error&unread=true&limit=1`;
    api
      .get<NotificationPage>(`/api/admin/notifications${q}`, true)
      .then((page) => active && setErrorIssues(page.total))
      .catch(() => {
        /* non-critical */
      });
    return () => {
      active = false;
    };
  }, [event.id]);

  const items: HealthItem[] = [];

  if (errorIssues > 0) {
    items.push({
      key: "delivery",
      tone: "error",
      icon: Mail,
      title: `${errorIssues} delivery / configuration ${
        errorIssues === 1 ? "issue" : "issues"
      }`,
      message: "An email or flyer upload failed. Review and resolve.",
      href: "/admin/notifications",
    });
  }

  if (summary.total_trees === 0) {
    items.push({
      key: "no-trees",
      tone: "warning",
      icon: ListTree,
      title: "No invite trees yet",
      message: "Create an invite tree to generate a shareable link.",
      href: `${base}/invite-trees`,
    });
  } else if (summary.exhausted_trees > 0) {
    items.push({
      key: "exhausted",
      tone: "warning",
      icon: Layers,
      title: `${summary.exhausted_trees} invite ${
        summary.exhausted_trees === 1 ? "tree is" : "trees are"
      } full`,
      message: "New guests on these links will be waitlisted.",
      href: `${base}/invite-trees`,
    });
  }

  if (summary.waitlisted_rsvps > 0) {
    items.push({
      key: "waitlisted",
      tone: "warning",
      icon: Clock,
      title: `${summary.waitlisted_rsvps} guest${
        summary.waitlisted_rsvps === 1 ? "" : "s"
      } waitlisted`,
      message: "Confirm them from the guest list if seats free up.",
      href: `${base}/rsvps?status=waitlisted`,
    });
  }

  if (
    event.status === "active" &&
    event.readiness_total > 0 &&
    event.readiness_completed < event.readiness_total
  ) {
    items.push({
      key: "not-ready",
      tone: "warning",
      icon: ClipboardList,
      title: "Live, but setup is incomplete",
      message: `${event.readiness_completed}/${event.readiness_total} readiness steps done.`,
      href: `${base}/settings`,
    });
  }

  if (!event.flyer_storage_path && !event.flyer_url) {
    items.push({
      key: "no-flyer",
      tone: "info",
      icon: ImageIcon,
      title: "No flyer added",
      message: "Add a flyer image for a richer invitation.",
      href: `${base}/settings`,
    });
  }

  if (items.length === 0) {
    return (
      <Card className="flex items-center gap-3 border-green-200 bg-green-50/60 p-4">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-semibold text-green-800">All clear</p>
          <p className="text-xs text-green-700/80">
            No outstanding issues need your attention for this event.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="font-serif text-base font-semibold text-royal">
          Attention needed
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          const tone = TONE_STYLES[item.tone];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-full items-start gap-3 rounded-lg border p-3 transition-colors",
                  tone.row
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", tone.icon)} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {item.message}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
