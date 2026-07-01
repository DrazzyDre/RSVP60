import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "royal" | "gold" | "green" | "amber" | "red" | "gray";
  icon?: React.ReactNode;
}) {
  const accentClass = {
    royal: "text-royal",
    gold: "text-gold-dark",
    green: "text-green-600",
    amber: "text-amber-600",
    red: "text-red-600",
    gray: "text-muted-foreground",
  }[accent ?? "royal"];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon && <span className={accentClass}>{icon}</span>}
        </div>
        <p className={cn("mt-2 text-3xl font-bold", accentClass)}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
