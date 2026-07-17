"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreVertical, Settings } from "lucide-react";
import type { EventAdmin } from "@/lib/types";
import { cn } from "@/lib/utils";

type MenuAction = {
  key: string;
  label: string;
  icon: React.ElementType;
  onSelect: () => void;
};

/**
 * Restrained overflow ("kebab") menu for an event card. Hosts secondary event
 * actions that don't belong on the primary button row — notably "Duplicate
 * event" (owner/admin only) and a shortcut to the event's settings.
 *
 * Accessible menu: button toggles with aria-haspopup/expanded; the popup is a
 * role="menu" with arrow-key navigation, Home/End, Escape (returns focus to the
 * trigger) and outside-click / Tab dismissal. Backend authorization stays
 * authoritative — hiding "Duplicate" from viewers is a convenience only.
 */
export function EventActionsMenu({
  event,
  canEdit,
  onDuplicate,
}: {
  event: EventAdmin;
  canEdit: boolean;
  onDuplicate: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const actions: MenuAction[] = [
    ...(canEdit
      ? [
          {
            key: "duplicate",
            label: "Duplicate event",
            icon: Copy,
            onSelect: onDuplicate,
          },
        ]
      : []),
    {
      key: "settings",
      label: "Event settings",
      icon: Settings,
      onSelect: () => router.push(`/admin/e/${event.id}/settings`),
    },
  ];

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Close on outside click. (Escape / Tab are handled on the menu itself so we
  // can also restore focus to the trigger.)
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Move focus to the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  function focusItem(delta: number, absolute?: "first" | "last") {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);
    let next: number;
    if (absolute === "first") next = 0;
    else if (absolute === "last") next = items.length - 1;
    else {
      next = currentIndex < 0 ? 0 : (currentIndex + delta + items.length) % items.length;
    }
    items[next]?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(-1);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0, "first");
        break;
      case "End":
        e.preventDefault();
        focusItem(0, "last");
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        // Let focus leave naturally, but dismiss the menu.
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${event.name}`}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${event.name}`}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border bg-white py-1 shadow-xl"
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setOpen(false);
                  action.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0 text-royal" aria-hidden />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
