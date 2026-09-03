"use client";

import { Target, CheckCircle2, XCircle, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ArmSnipeDialog } from "@/components/sniper/arm-snipe-dialog";
import { shortenAddress, formatWeiToEth, timeAgo } from "@/lib/utils";
import { explorerAddressUrl } from "@/lib/constants";
import type { SniperMatchDTO, MatchStatus } from "@/types";

export function MatchFeed({ matches, onChanged }: { matches: SniperMatchDTO[]; onChanged: () => void }) {
  async function handleSkip(match: SniperMatchDTO) {
    try {
      const res = await fetch(`/api/sniper/matches/${match.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SKIPPED", skipReason: "Skipped from the feed" }),
      });
      if (!res.ok) throw new Error("Failed to skip");
      onChanged();
    } catch {
      toast.error("Failed to skip this match");
    }
  }

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No matches yet"
        description="Turn automation on and enable at least one rule above — matches will appear here as they're detected, and nothing fires until you click Snipe."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contract</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Detected</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {matches.map((match) => (
          <TableRow key={match.id}>
            <TableCell>
              <a
                href={explorerAddressUrl(match.chainId, match.contractAddress)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-primary hover:underline"
              >
                {shortenAddress(match.contractAddress)}
              </a>
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {match.metadata?.mintPriceWei ? `${formatWeiToEth(String(match.metadata.mintPriceWei))} ETH` : "—"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{timeAgo(match.detectedAt)}</TableCell>
            <TableCell>
              <MatchStatusBadge status={match.status} />
            </TableCell>
            <TableCell className="text-right">
              {match.status === "OBSERVED" && (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleSkip(match)}>
                    <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Skip
                  </Button>
                  <ArmSnipeDialog match={match} />
                </div>
              )}
              {match.status !== "OBSERVED" && match.skipReason && (
                <span className="text-xs text-muted-foreground">{match.skipReason}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MatchStatusBadge({ status }: { status: MatchStatus }) {
  switch (status) {
    case "OBSERVED":
      return (
        <Badge variant="muted">
          <Clock className="h-3 w-3" aria-hidden="true" /> Observed
        </Badge>
      );
    case "ARMED":
      return <Badge variant="warning">Armed</Badge>;
    case "EXECUTED":
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Executed
        </Badge>
      );
    case "SKIPPED":
      return (
        <Badge variant="muted">
          <XCircle className="h-3 w-3" aria-hidden="true" /> Skipped
        </Badge>
      );
    case "EXPIRED":
      return <Badge variant="destructive">Expired</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}
