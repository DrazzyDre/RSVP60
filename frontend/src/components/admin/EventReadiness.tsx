"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { EventReadiness as EventReadinessData, ReadinessItem } from "@/lib/types";
import { Button } from "@/components/ui/button";

// The "link tested" step can't be detected server-side, so it's tracked locally
// per event as an explicit admin acknowledgement.
const TESTED_KEY = "rsvp60_link_tested";

function readTested(eventId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(TESTED_KEY);
    return raw ? JSON.parse(raw)[eventId] === true : false;
  } catch {
    return false;
  }
}

function writeTested(eventId: string, value: boolean) {
  if (typeof window === "undefined") return;
  let map: Record<string, boolean> = {};
  try {
    map = JSON.parse(window.localStorage.getItem(TESTED_KEY) || "{}");
  } catch {
    map = {};
  }
  map[eventId] = value;
  window.localStorage.setItem(TESTED_KEY, JSON.stringify(map));
}

export function EventReadiness({ eventId }: { eventId: string }) {
  const [data, setData] = useState<EventReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTested(readTested(eventId));
    api
      .get<EventReadinessData>(`/api/admin/events/${eventId}/readiness`, true)
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking readiness…
      </div>
    );
  }
  if (!data) return null;

  const testedItem: ReadinessItem = {
    key: "tested",
    label: "Public invite link tested",
    done: tested,
    hint: "Open a tree's invite link in a new tab, then mark this as done.",
  };
  const items = [...data.items, testedItem];
  const completed = data.completed + (tested ? 1 : 0);
  const total = data.total + 1;
  const pct = Math.round((completed / total) * 100);
  const allReady = completed === total;

  function toggleTested() {
    const next = !tested;
    setTested(next);
    writeTested(eventId, next);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">
            {allReady ? "Ready to share 🎉" : `${completed} of ${total} ready`}
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-royal to-gold transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-3">
            {item.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
            )}
            <div className="flex-1">
              <p
                className={
                  item.done
                    ? "text-sm text-foreground"
                    : "text-sm font-medium text-foreground"
                }
              >
                {item.label}
              </p>
              {!item.done && (
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              )}
            </div>
            {item.key === "tested" && (
              <Button size="sm" variant="ghost" onClick={toggleTested}>
                {tested ? "Undo" : "Mark done"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
