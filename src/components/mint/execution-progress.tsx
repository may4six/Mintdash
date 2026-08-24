"use client";

import { CheckCircle2, XCircle, Clock, Loader2, ExternalLink, RotateCcw } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { shortenAddress, shortenHash } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/constants";
import type { MintExecutionItem, ItemStatus } from "@/types";

export function ExecutionProgress({
  items,
  chainId,
  isRunning,
  onRetryFailed,
}: {
  items: MintExecutionItem[];
  chainId: number;
  isRunning: boolean;
  onRetryFailed: () => void;
}) {
  const confirmed = items.filter((i) => i.status === "CONFIRMED").length;
  const failed = items.filter((i) => i.status === "FAILED").length;
  const done = confirmed + failed;
  const progressPct = items.length > 0 ? (done / items.length) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {confirmed} confirmed · {failed} failed · {items.length - done} remaining
        </p>
        {failed > 0 && !isRunning && (
          <Button size="sm" variant="outline" onClick={onRetryFailed}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry {failed} failed
          </Button>
        )}
      </div>
      <Progress value={progressPct} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receiver</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempt</TableHead>
            <TableHead>Tx</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.walletId}>
              <TableCell className="font-mono text-xs">{shortenAddress(item.address)}</TableCell>
              <TableCell>
                <StatusChip status={item.status} error={item.errorMessage} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{item.attempt}</TableCell>
              <TableCell>
                {item.txHash ? (
                  <a
                    href={explorerTxUrl(chainId, item.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {shortenHash(item.txHash)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusChip({ status, error }: { status: ItemStatus; error?: string }) {
  switch (status) {
    case "PENDING":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Pending
        </span>
      );
    case "SUBMITTED":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-warning">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Submitted
        </span>
      );
    case "CONFIRMED":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Confirmed
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive" title={error}>
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Failed
        </span>
      );
    default:
      return null;
  }
}
