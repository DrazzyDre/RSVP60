"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Keyboard, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Pull the guest check-in token out of a scanned QR payload.
 *
 * Guest QR codes encode the admin deep link `…/admin/check-in?token=XXX`, but we
 * also accept a bare token so a plain-text code still works. Anything else
 * (a random website, a Wi-Fi QR, …) returns null so the caller can warn.
 */
export function extractToken(data: string): string | null {
  const raw = (data || "").trim();
  if (!raw) return null;
  try {
    const t = new URL(raw).searchParams.get("token");
    if (t && t.trim()) return t.trim();
  } catch {
    /* not a URL — fall through to the bare-token check */
  }
  // token_urlsafe(24) → url-safe base64: letters, digits, "-" and "_".
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw)) return raw;
  return null;
}

function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access was blocked. Allow the camera, or enter a token below.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera was found on this device. Enter a token below instead.";
  return "Couldn't start the camera. Enter a token below instead.";
}

type ScanState = "starting" | "scanning" | "error";

export function QrScannerDialog({
  onDetected,
  onClose,
}: {
  onDetected: (token: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // Guard so we only ever fire onDetected once, then tear the camera down.
  const doneRef = useRef(false);

  const [state, setState] = useState<ScanState>("starting");
  const [error, setError] = useState<string>("");
  const [hint, setHint] = useState<string>("");
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const finish = useCallback(
    (token: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      stop();
      onDetected(token);
    },
    [onDetected, stop]
  );

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const jsQR = (await import("jsqr")).default;
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        if (!cancelled) {
          setState("error");
          setError("This device or browser can't use the camera. Enter a token below.");
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        if (cancelled) return;
        setState("scanning");

        const tick = () => {
          const v = videoRef.current;
          const c = canvasRef.current;
          if (!v || !c || doneRef.current) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
            const w = v.videoWidth;
            const h = v.videoHeight;
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const code = jsQR(img.data, w, h, {
                inversionAttempts: "dontInvert",
              });
              if (code && code.data) {
                const token = extractToken(code.data);
                if (token) {
                  finish(token);
                  return;
                }
                // A QR that isn't a guest code — keep scanning, but say so.
                setHint("That code isn't a guest check-in code. Keep it steady…");
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setError(cameraErrorMessage(err));
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [finish, stop]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const token = extractToken(manual) ?? manual.trim();
    if (token) finish(token);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Scan guest QR code"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-royal">Scan guest QR</h3>
            <p className="text-xs text-muted-foreground">
              Point the camera at a guest&apos;s check-in code.
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {state !== "error" ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />
            {/* Simple viewfinder frame */}
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
            {state === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Starting camera…
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {state === "scanning" && hint && (
          <p className="mt-2 text-center text-xs text-amber-700">{hint}</p>
        )}
        {state === "scanning" && !hint && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Camera className="h-3.5 w-3.5" /> Scanning…
          </p>
        )}

        {/* Manual token fallback — always available, primary when camera fails. */}
        <form onSubmit={submitManual} className="mt-4 border-t pt-4">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5" /> Or enter a token / link manually
          </label>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Paste token or check-in link"
              className="h-10"
            />
            <Button type="submit" disabled={!manual.trim()}>
              Find
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
