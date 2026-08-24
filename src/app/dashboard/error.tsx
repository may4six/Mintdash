"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 p-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-foreground">Something went wrong</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {error.message || "An unexpected error occurred loading this page."}
        </p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  );
}
