import * as React from "react";
import { Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} role="separator" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-secondary", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-muted-foreground", className)} aria-hidden="true" />;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusDot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", className)} />;
}
