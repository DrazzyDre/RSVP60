"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Track browser online/offline status.
 *
 * Starts optimistic (`true`) so the first server-rendered/hydration pass never
 * flashes an "offline" banner, then syncs to the real value on mount and on
 * every `online`/`offline` event. Used by the check-in page to warn door staff
 * and disable check-in actions when the connection drops.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

/**
 * Warn the user before leaving the page (tab close / reload / navigation) while
 * a form has unsaved changes. Deliberately minimal: it wires the browser's
 * native `beforeunload` guard and removes it otherwise, so a successful save
 * (which flips dirtiness back to false) never warns. In-app navigation is
 * handled by the caller (e.g. confirming on Cancel).
 *
 * Accepts either a boolean (re-renders drive registration, as EventForm uses)
 * or a callback evaluated lazily at unload time — for callers whose dirty state
 * lives behind an imperative handle (e.g. the setup wizard's current step)
 * rather than in reactive state.
 */
export function useUnsavedChanges(dirty: boolean | (() => boolean)): void {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // A callback is always "armed" (checked live per event); a boolean arms only
  // while true, preserving the original behaviour exactly.
  const armed = typeof dirty === "function" || dirty;

  useEffect(() => {
    if (!armed) return;
    const handler = (e: BeforeUnloadEvent) => {
      const current = dirtyRef.current;
      const isDirty = typeof current === "function" ? current() : current;
      if (!isDirty) return;
      e.preventDefault();
      // Required by some browsers to trigger the native confirm prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [armed]);
}
