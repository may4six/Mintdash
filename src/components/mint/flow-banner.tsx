import { cn } from "@/lib/utils";

function FlowNode({
  label,
  sublabel,
  className,
}: {
  label: string;
  sublabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[108px] flex-col items-center gap-1 rounded-md border bg-card px-4 py-3",
        className
      )}
    >
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      <span className="text-center text-[10px] text-muted-foreground">{sublabel}</span>
    </div>
  );
}

function FlowConnector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center px-1.5">
      <span className="mb-1 whitespace-nowrap font-mono text-[9px] text-muted-foreground/70">{label}</span>
      <svg width="40" height="8" viewBox="0 0 40 8" className="text-primary" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="34"
          y2="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          className="animate-signal-flow"
        />
        <polygon points="34,0 40,4 34,8" fill="currentColor" />
      </svg>
    </div>
  );
}

/** Renders the product's core mechanic as a literal signal-path diagram:
 * who pays, who's called, who receives. */
export function FlowBanner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center overflow-x-auto py-1", className)}>
      <FlowNode label="Operator" sublabel="pays gas + price" className="border-operator/40 text-operator" />
      <FlowConnector label="mint(to)" />
      <FlowNode label="Contract" sublabel="NFT contract" className="border-border-strong text-foreground" />
      <FlowConnector label="delivers" />
      <FlowNode label="Receiver" sublabel="holds the NFT" className="border-receiver/40 text-receiver" />
    </div>
  );
}
