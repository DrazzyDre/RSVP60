"use client";

import * as React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Promise-based confirmation dialog for irreversible / destructive actions.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({
 *     title: "Deactivate this admin?",
 *     description: "They will be signed out and cannot log in until reactivated.",
 *     confirmLabel: "Deactivate",
 *     destructive: true,
 *   })) {
 *     // ...perform the action
 *   }
 *
 * Only used for actions with real consequences — harmless actions should just
 * happen. Accessible: focus is trapped to the dialog, Escape / backdrop cancels,
 * and focus returns to the trigger afterwards.
 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    triggerRef.current = document.activeElement;
    return new Promise<boolean>((resolve) => {
      setDialog({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      setDialog((current) => {
        current?.resolve(result);
        return null;
      });
      // Return focus to whatever opened the dialog.
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) {
        window.setTimeout(() => trigger.focus(), 0);
      }
    },
    []
  );

  useEffect(() => {
    if (!dialog) return;
    confirmBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 print:hidden"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby={dialog.description ? "confirm-desc" : undefined}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              {dialog.destructive && (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  id="confirm-title"
                  className="font-serif text-lg font-bold text-royal"
                >
                  {dialog.title}
                </h2>
                {dialog.description && (
                  <p id="confirm-desc" className="mt-1.5 text-sm text-muted-foreground">
                    {dialog.description}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => close(false)}>
                {dialog.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                ref={confirmBtnRef}
                variant={dialog.destructive ? "destructive" : "default"}
                onClick={() => close(true)}
              >
                {dialog.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
