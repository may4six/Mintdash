import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/types";

export function RunStatusBadge({ status }: { status: RunStatus }) {
  switch (status) {
    case "COMPLETED":
      return <Badge variant="success">Completed</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    case "PARTIAL":
      return <Badge variant="warning">Partial</Badge>;
    case "RUNNING":
      return <Badge variant="default">Running</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}
