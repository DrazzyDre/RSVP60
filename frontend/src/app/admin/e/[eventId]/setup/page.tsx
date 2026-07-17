"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { SetupWizard } from "@/components/admin/setup/SetupWizard";

export default function EventSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <SetupWizard />
    </Suspense>
  );
}
