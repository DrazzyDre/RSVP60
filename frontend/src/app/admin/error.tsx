"use client";

import * as React from "react";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { captureClientError } from "@/lib/observability";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for the admin area. Renders a friendly fallback
 * (keeping the surrounding shell intact) and reports the error to optional
 * client error tracking.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureClientError(error, { source: "admin-error" });
  }, [error]);

  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-xl border border-dashed bg-white p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="mt-4 font-serif text-xl font-semibold text-royal">
        This page hit an error
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Something went wrong while loading this view. You can try again, or head
        back to your events.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/admin/events">
          <Button variant="outline">View all events</Button>
        </Link>
      </div>
    </div>
  );
}
