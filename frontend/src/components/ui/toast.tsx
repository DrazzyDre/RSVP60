"use client";

import * as React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free toast system.
 *
 * Replaces the inconsistent mix of browser `alert()` calls and transient inline
 * banners with one accessible, standardised feedback channel. Wrap the admin
 * area once in <ToastProvider>, then anywhere below call `useToast()`:
 *
 *   const toast = useToast();
 *   toast.success("Event created");
 *   toast.error("Could not save event.");
 *
 * Success / info toasts announce politely; errors assertively. Toasts
 * auto-dismiss (errors linger a little longer) and can be dismissed manually.
 */

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let _id = 0;

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-green-200 bg-green-50 text-green-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-royal/20 bg-royal/5 text-royal-dark",
};

const VARIANT_ICON: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const VARIANT_ICON_COLOR: Record<ToastVariant, string> = {
  success: "text-green-600",
  error: "text-red-600",
  info: "text-royal",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, variant: ToastVariant) => {
    const id = ++_id;
    setToasts((list) => [...list, { id, message, variant }]);
    // Errors linger longer so they can't be missed; others clear quickly.
    const ttl = variant === "error" ? 6500 : 4000;
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Viewport: bottom on mobile, top-right on larger screens. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end print:hidden"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = VARIANT_ICON[toast.variant];
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg transition-all duration-200",
        VARIANT_STYLES[toast.variant],
        entered ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      )}
    >
      <Icon
        className={cn("mt-0.5 h-5 w-5 flex-shrink-0", VARIANT_ICON_COLOR[toast.variant])}
      />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-0.5 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
