"use client";

import { useEffect, useState } from "react";

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
 * native `beforeunload` guard when `dirty` is true and removes it otherwise, so
 * a successful save (which flips `dirty` back to false) never warns. In-app
 * navigation is handled by the caller (e.g. confirming on Cancel).
 */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required by some browsers to trigger the native confirm prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
