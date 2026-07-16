// Optional, dependency-free client error tracking (Phase 7).
//
// When NEXT_PUBLIC_SENTRY_DSN is set, uncaught render errors (via the Next.js
// error boundaries) and global window errors are reported to Sentry using its
// public "envelope" ingest endpoint over fetch — no SDK, no webpack plugin, so
// the Next.js build is untouched. When the DSN is absent, every function here is
// a no-op and the app runs normally.
//
// Privacy: only the error type, a truncated message, the stack and the current
// route are sent. No breadcrumbs, no user identity, no request bodies — so guest
// name / email / phone are never transmitted. The DSN is a PUBLIC ingest key
// (safe for the browser); it is never a backend secret.

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";
const ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || "production";

interface ParsedDsn {
  ingestUrl: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  // Format: https://<publicKey>@<host>/<projectId>
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    const ingestUrl = `${url.protocol}//${url.host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`;
    return { ingestUrl, publicKey };
  } catch {
    return null;
  }
}

const parsed = DSN ? parseDsn(DSN) : null;

/** Whether client error reporting is active (a valid DSN is configured). */
export function isClientErrorTrackingEnabled(): boolean {
  return parsed !== null;
}

function randomEventId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    /* fall through */
  }
  // Fallback: 32 hex chars.
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/**
 * Report an error to Sentry (no-op when disabled). Fire-and-forget: it never
 * throws and never blocks the UI.
 */
export function captureClientError(
  error: unknown,
  context?: { route?: string; source?: string }
): void {
  if (!parsed) return;
  try {
    const err =
      error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
    const eventId = randomEventId();
    const nowSeconds = Date.now() / 1000;

    const event = {
      event_id: eventId,
      timestamp: nowSeconds,
      platform: "javascript",
      level: "error",
      environment: ENVIRONMENT,
      logger: "gatherarc.client",
      tags: {
        app: "gatherarc",
        route: context?.route ?? safePathname(),
        source: context?.source ?? "boundary",
      },
      exception: {
        values: [
          {
            type: err.name || "Error",
            value: (err.message || "").slice(0, 500),
            stacktrace: err.stack
              ? { frames: [], raw: String(err.stack).slice(0, 4000) }
              : undefined,
          },
        ],
      },
    };

    const body =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event);

    // keepalive lets the request survive a route change / unload.
    void fetch(parsed.ingestUrl, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    }).catch(() => {
      /* swallow — reporting must never affect the app */
    });
  } catch {
    /* never throw from the reporter */
  }
}

function safePathname(): string {
  try {
    return typeof window !== "undefined" ? window.location.pathname : "";
  } catch {
    return "";
  }
}

let globalHandlersInstalled = false;

/**
 * Install window-level handlers for errors that never reach a React boundary
 * (async errors, unhandled promise rejections). Idempotent and a no-op when
 * tracking is disabled.
 */
export function initClientErrorHandlers(): void {
  if (globalHandlersInstalled || !parsed || typeof window === "undefined") return;
  globalHandlersInstalled = true;
  window.addEventListener("error", (e) => {
    captureClientError(e.error ?? e.message, { source: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    captureClientError(e.reason, { source: "unhandledrejection" });
  });
}
