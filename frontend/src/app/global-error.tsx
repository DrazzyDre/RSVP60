"use client";

import * as React from "react";
import { useEffect } from "react";
import { captureClientError } from "@/lib/observability";

/**
 * App-wide error boundary (Next.js). Catches render errors that escape every
 * nested boundary and reports them to optional client error tracking. Must
 * render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureClientError(error, { source: "global-error" });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-gray-900">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              An unexpected error occurred. Please try again — if it keeps
              happening, refresh the page.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
