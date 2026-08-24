import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-border-strong bg-secondary text-secondary-foreground",
        operator: "border-operator/30 bg-operator/10 text-operator",
        receiver: "border-receiver/30 bg-receiver/10 text-receiver",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        muted: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
