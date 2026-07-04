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
