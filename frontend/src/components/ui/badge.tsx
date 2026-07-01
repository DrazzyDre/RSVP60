import * as React from "react";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  accepted: "bg-green-100 text-green-800 border-green-200",
  active: "bg-green-100 text-green-800 border-green-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  waitlisted: "bg-amber-100 text-amber-800 border-amber-200",
  almost_full: "bg-amber-100 text-amber-800 border-amber-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  paused: "bg-gray-100 text-gray-600 border-gray-200",
  exhausted: "bg-red-100 text-red-700 border-red-200",
  default: "bg-royal/10 text-royal border-royal/20",
};

const labels: Record<string, string> = {
  almost_full: "Almost full",
};

export function Badge({
  status,
  className,
  children,
}: {
  status?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const key = status ?? "default";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[key] ?? styles.default,
        className
      )}
    >
      {children ?? labels[key] ?? key}
    </span>
  );
}
