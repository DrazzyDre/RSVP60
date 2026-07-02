import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "royal" | "gold" | "green" | "amber" | "red" | "gray";
  icon?: React.ReactNode;
  href?: string;
}) {
  const accentClass = {
    royal: "text-royal",
    gold: "text-gold-dark",
    green: "text-green-600",
    amber: "text-amber-600",
    red: "text-red-600",
    gray: "text-muted-foreground",
  }[accent ?? "royal"];

  const card = (
    <Card
      className={cn(
        "h-full",
        href &&
          "cursor-pointer transition hover:-translate-y-0.5 hover:border-royal/40 hover:shadow-md"
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon && <span className={accentClass}>{icon}</span>}
        </div>
        <p className={cn("mt-2 text-3xl font-bold", accentClass)}>{value}</p>
        <div className="mt-1 flex items-center justify-between">
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : (
            <span />
          )}
          {href && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground/70">
              View <ArrowUpRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {card}
      </Link>
    );
  }
  return card;
}
