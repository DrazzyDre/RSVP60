"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  LayoutGrid,
  Search,
} from "lucide-react";
import type { EventAdmin } from "@/lib/types";
import { useEvents } from "@/components/admin/event-context";
import { useCanEdit } from "@/components/admin/auth-context";
import { cn } from "@/lib/utils";

/**
 * The workspace selector: a premium popover (bottom sheet on small screens)
 * for switching between event workspaces. Switching navigates to the same
 * scoped page under the new event (see EventProvider.switchEvent), so the
 * whole workspace re-scopes safely.
 *
 * Accessibility: the trigger is a labelled button with aria-haspopup/expanded;
 * the panel is a dialog with focus moved to search on open, a Tab cycle kept
 * inside, Escape to close, and focus returned to the trigger. Status is
 * conveyed with text (never colour alone).
 */

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  draft: "bg-amber-500",
  closed: "bg-gray-400",
  archived: "bg-gray-300",
};

const STATUS_GROUP_ORDER = ["active", "draft", "closed", "archived"] as const;

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Navy monogram tile used in the trigger and each option. */
function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-royal font-serif text-sm font-bold text-ivory",
        className
      )}
    >
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

function ReadinessTag({ ev }: { ev: EventAdmin }) {
  if (!ev.readiness_total) return null;
  const ready = ev.readiness_completed >= ev.readiness_total;
  return ready ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> Ready
    </span>
  ) : (
    <span className="text-xs font-medium text-muted-foreground">
      {ev.readiness_completed}/{ev.readiness_total}
    </span>
  );
}

export function WorkspaceSwitcher({
  variant = "bar",
  className,
}: {
  /** "bar" = rich desktop trigger; "compact" = slim mobile-header trigger. */
  variant?: "bar" | "compact";
  className?: string;
}) {
  const router = useRouter();
  const { events, selectedEvent, selectedEventId, switchEvent, recentEventIds, loading } =
    useEvents();
  const canEdit = useCanEdit();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function close(returnFocus = true) {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  // Focus the search field when the panel opens.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Escape closes; Tab cycles inside the panel; arrows move between options.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (e.key === "Tab" && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const options = Array.from(
          panel.querySelectorAll<HTMLElement>("[data-ws-option]")
        );
        if (options.length === 0) return;
        e.preventDefault();
        const idx = options.indexOf(document.activeElement as HTMLElement);
        const next =
          e.key === "ArrowDown"
            ? options[Math.min(idx + 1, options.length - 1)] ?? options[0]
            : options[Math.max(idx - 1, 0)] ?? options[options.length - 1];
        next.focus();
      }
    }
    // Close when clicking outside the panel and trigger (desktop popover).
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? events.filter(
            (e) =>
              e.name.toLowerCase().includes(q) ||
              e.host_or_celebrant_name.toLowerCase().includes(q)
          )
        : events,
    [events, q]
  );

  // Recent first (max 3, in recency order), then the rest grouped by status.
  const recent = useMemo(
    () =>
      q
        ? []
        : recentEventIds
            .map((id) => events.find((e) => e.id === id))
            .filter((e): e is EventAdmin => Boolean(e))
            .slice(0, 3),
    [q, recentEventIds, events]
  );
  const recentIds = new Set(recent.map((e) => e.id));
  const groups = useMemo(() => {
    if (q) return [];
    return STATUS_GROUP_ORDER.map((status) => ({
      status,
      items: filtered.filter((e) => e.status === status && !recentIds.has(e.id)),
    })).filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filtered, recent]);

  function pick(id: string) {
    close(false);
    if (id !== selectedEventId) switchEvent(id);
  }

  function go(href: string) {
    close(false);
    router.push(href);
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          selectedEvent
            ? `Current event: ${selectedEvent.name}. Switch event`
            : "Switch event"
        }
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 rounded-xl border bg-white text-left transition-colors hover:border-royal/40 hover:bg-royal/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          variant === "bar" ? "px-3 py-2" : "px-2.5 py-1.5"
        )}
      >
        {loading ? (
          <span className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        ) : selectedEvent ? (
          <>
            <Monogram name={selectedEvent.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {selectedEvent.name}
              </span>
              {variant === "bar" && (
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      STATUS_DOT[selectedEvent.status] ?? "bg-gray-300"
                    )}
                  />
                  <span className="truncate">
                    {statusLabel(selectedEvent.status)}
                    {selectedEvent.event_date
                      ? ` · ${shortDate(selectedEvent.event_date)}`
                      : ""}
                    {selectedEvent.readiness_total
                      ? ` · Ready ${selectedEvent.readiness_completed}/${selectedEvent.readiness_total}`
                      : ""}
                  </span>
                </span>
              )}
            </span>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            >
              <CalendarRange className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
              No events yet
            </span>
          </>
        )}
        <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Backdrop (mobile sheet only) */}
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => close(false)}
            aria-hidden
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Switch event"
            className={cn(
              "z-50 flex flex-col overflow-hidden border bg-white shadow-xl",
              // Mobile: bottom sheet. Desktop: popover under the trigger.
              "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl",
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:max-h-[70vh] sm:w-[380px] sm:rounded-xl"
            )}
          >
            <div className="border-b p-3">
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Switch event
              </p>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events…"
                  aria-label="Search events"
                  className="h-10 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {events.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">No events yet</p>
                  <p className="mt-1">
                    {canEdit
                      ? "Create your first event to open its workspace."
                      : "Ask an owner or admin to create the first event."}
                  </p>
                </div>
              ) : q && filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No events match “{query.trim()}”.
                </p>
              ) : q ? (
                <OptionGroup
                  label="Results"
                  items={filtered}
                  selectedId={selectedEventId}
                  onPick={pick}
                />
              ) : (
                <>
                  {recent.length > 0 && (
                    <OptionGroup
                      label="Recent"
                      items={recent}
                      selectedId={selectedEventId}
                      onPick={pick}
                    />
                  )}
                  {groups.map((g) => (
                    <OptionGroup
                      key={g.status}
                      label={statusLabel(g.status)}
                      items={g.items}
                      selectedId={selectedEventId}
                      onPick={pick}
                    />
                  ))}
                </>
              )}
            </div>

            <div className="space-y-1 border-t p-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => go("/admin/events/new")}
                  className="flex w-full items-center gap-2.5 rounded-lg bg-royal px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-royal-light"
                >
                  <CalendarPlus className="h-4 w-4" /> Create new event
                </button>
              )}
              <button
                type="button"
                onClick={() => go("/admin/events")}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <LayoutGrid className="h-4 w-4 text-royal" /> View all events
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OptionGroup({
  label,
  items,
  selectedId,
  onPick,
}: {
  label: string;
  items: EventAdmin[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      {items.map((ev) => {
        const selected = ev.id === selectedId;
        return (
          <button
            key={ev.id}
            type="button"
            data-ws-option
            onClick={() => onPick(ev.id)}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "bg-royal/5"
            )}
          >
            <Monogram name={ev.name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {ev.name}
                </span>
                {selected && (
                  <Check
                    className="h-4 w-4 flex-shrink-0 text-royal"
                    aria-label="Current event"
                  />
                )}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                    STATUS_DOT[ev.status] ?? "bg-gray-300"
                  )}
                />
                <span className="truncate">
                  {statusLabel(ev.status)}
                  {ev.event_date ? ` · ${shortDate(ev.event_date)}` : ""}
                  {!ev.accepting_rsvps && ev.status === "active"
                    ? " · RSVPs closed"
                    : ""}
                </span>
              </span>
            </span>
            <ReadinessTag ev={ev} />
          </button>
        );
      })}
    </div>
  );
}
