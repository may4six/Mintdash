"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, FormField } from "@/components/ui/form-elements";
import type { CampaignDTO } from "@/types";

export function ScheduleArmPanel({
  campaign,
  onUpdated,
}: {
  campaign: CampaignDTO;
  onUpdated?: () => void;
}) {
  const [isoLocal, setIsoLocal] = useState(() => {
    const d = new Date(Date.now() + 120_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });
  const [maxFeeGwei, setMaxFeeGwei] = useState("");
  const [priorityGwei, setPriorityGwei] = useState("0.05");
  const [busy, setBusy] = useState(false);

  const status = (campaign as { scheduleStatus?: string }).scheduleStatus ?? "NONE";
  const scheduledAt = (campaign as { scheduledAt?: string | null }).scheduledAt;

  function toWeiFromGwei(gwei: string): string | undefined {
    const t = gwei.trim();
    if (!t) return undefined;
    return String(BigInt(Math.round(Number(t) * 1e9)));
  }

  async function arm() {
    setBusy(true);
    try {
      const local = new Date(isoLocal);
      if (Number.isNaN(local.getTime())) throw new Error("Invalid date/time");
      const res = await fetch(`/api/campaigns/${campaign.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: local.toISOString(),
          maxFeePerGasWei: toWeiFromGwei(maxFeeGwei),
          maxPriorityFeePerGasWei: toWeiFromGwei(priorityGwei),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Arm failed");
      toast.success(`Armed FCFS at ${local.toISOString()}`);
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Arm failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/schedule`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cancel failed");
      toast.success("Cancelled");
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function fireNow() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/fire`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fire failed");
      toast.success(`Fired: ${data.status} (${data.ok} ok / ${data.bad} failed)`);
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fire failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>FCFS schedule (self-mint)</CardTitle>
        <CardDescription>
          Cron claims up to 2 minutes early, pre-builds txs, then spins ~10ms until open.
          Prefer &quot;Fire now&quot; if you are online at T0. Fund every receiver with gas + mint price.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Status: <span className="font-mono text-foreground">{status}</span>
          {scheduledAt ? (
            <>
              {" "}
              · <span className="font-mono">{new Date(scheduledAt).toISOString()}</span>
            </>
          ) : null}
        </p>

        <FormField label="Mint open time (local)">
          <Input
            type="datetime-local"
            step="1"
            value={isoLocal}
            onChange={(e) => setIsoLocal(e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-2">
          <FormField label="Max fee (gwei)">
            <Input
              inputMode="decimal"
              value={maxFeeGwei}
              onChange={(e) => setMaxFeeGwei(e.target.value)}
              placeholder="e.g. 0.5"
            />
          </FormField>
          <FormField label="Priority fee (gwei)">
            <Input
              inputMode="decimal"
              value={priorityGwei}
              onChange={(e) => setPriorityGwei(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void arm()} isLoading={busy} disabled={status === "ARMED"}>
            Arm FCFS
          </Button>
          <Button variant="default" onClick={() => void fireNow()} isLoading={busy}>
            Fire now (wait to scheduledAt if set)
          </Button>
          {status === "ARMED" && (
            <Button variant="destructive" onClick={() => void cancel()} isLoading={busy}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}