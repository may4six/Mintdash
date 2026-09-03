"use client";

import { toast } from "sonner";
import { Trash2, Rocket } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { shortenAddress, formatWeiToEth } from "@/lib/utils";
import type { SniperRuleDTO } from "@/types";

export function RuleList({ rules, onChanged }: { rules: SniperRuleDTO[]; onChanged: () => void }) {
  async function toggleEnabled(rule: SniperRuleDTO) {
    try {
      const res = await fetch(`/api/sniper/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) throw new Error("Failed to update rule");
      onChanged();
    } catch {
      toast.error("Failed to update rule");
    }
  }

  async function handleDelete(rule: SniperRuleDTO) {
    if (!confirm(`Delete rule "${rule.name}"? Its match history goes with it.`)) return;
    try {
      const res = await fetch(`/api/sniper/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
      onChanged();
    } catch {
      toast.error("Failed to delete rule");
    }
  }

  if (rules.length === 0) {
    return (
      <EmptyState
        icon={Rocket}
        title="No rules yet"
        description="Create one to start watching for drops under a price you set."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rule</TableHead>
          <TableHead>Max price</TableHead>
          <TableHead>Qty/wallet</TableHead>
          <TableHead>Operator</TableHead>
          <TableHead>Matches</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {formatWeiToEth(rule.maxPriceWei)} ETH
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{rule.quantityPerWallet}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {rule.operator ? shortenAddress(rule.operator.address) : "—"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{rule._count?.matches ?? 0}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => void toggleEnabled(rule)} aria-label={`Toggle ${rule.name}`}>
                  <Badge variant={rule.enabled ? "success" : "muted"}>{rule.enabled ? "Watching" : "Off"}</Badge>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete(rule)}
                  aria-label={`Delete ${rule.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
