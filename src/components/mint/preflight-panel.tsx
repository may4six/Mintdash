"use client";

import type { ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { shortenAddress, formatWeiToEth, cn } from "@/lib/utils";
import type { PreflightResult } from "@/types";

export function PreflightPanel({ result }: { result: PreflightResult }) {
  const readyCount = result.receivers.filter((r) => r.ready).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat
          label="Operator balance"
          value={`${formatWeiToEth(result.operator.balanceWei)} ETH`}
          tone={result.operator.sufficientFunds ? "success" : "destructive"}
        />
        <SummaryStat label="Est. total cost" value={`${formatWeiToEth(result.totalEstimatedCostWei)} ETH`} />
        <SummaryStat
          label="Receivers ready"
          value={`${readyCount}/${result.receivers.length}`}
          tone={result.allReady ? "success" : "warning"}
        />
        <SummaryStat
          label="Contract"
          value={result.contractHasCode ? "Code found" : "No code found"}
          tone={result.contractHasCode ? "success" : "destructive"}
        />
      </div>

      {!result.operator.sufficientFunds && (
        <Notice tone="destructive">
          Operator is short {formatWeiToEth(result.operator.shortfallWei ?? "0")} ETH for this run&apos;s estimated
          cost. Fund the Operator wallet before executing.
        </Notice>
      )}

      {result.requiresReceiverSignature && (
        <Notice tone="warning">
          This function has no recipient parameter, so it mints to whoever calls it. Each Receiver will need to
          connect and sign their own mint — the Operator can&apos;t pay on their behalf for this contract.
        </Notice>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receiver</TableHead>
            <TableHead>Eligibility</TableHead>
            <TableHead>Gas estimate</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.receivers.map((r) => (
            <TableRow key={r.walletId}>
              <TableCell className="font-mono text-xs">{shortenAddress(r.address)}</TableCell>
              <TableCell>
                <EligibilityBadge status={r.eligibility} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {r.gasEstimateWei ? `${formatWeiToEth(r.gasEstimateWei)} ETH` : "—"}
              </TableCell>
              <TableCell>
                {r.ready ? (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {r.blockReason ?? "Blocked"}
                  </span>
                )}
                {r.eligibilityNote && <p className="mt-0.5 text-[10px] text-muted-foreground">{r.eligibilityNote}</p>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Notice({ tone, children }: { tone: "destructive" | "warning"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-xs",
        tone === "destructive" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-warning/30 bg-warning/5 text-warning"
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-sm font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function EligibilityBadge({ status }: { status: PreflightResult["receivers"][number]["eligibility"] }) {
  if (status === "ELIGIBLE") return <Badge variant="success">Eligible</Badge>;
  if (status === "INELIGIBLE") return <Badge variant="destructive">Ineligible</Badge>;
  return (
    <Badge variant="muted">
      <HelpCircle className="h-3 w-3" aria-hidden="true" /> Unknown
    </Badge>
  );
}
