"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parseGwei } from "viem";

export function SchedulePanel() {
  const [slug, setSlug] = useState("exit-founders");
  const [minter, setMinter] = useState(
    "0x1c4abb26936c050a864e23017881e588ddb4e9f4",
  );
  const [quantity, setQuantity] = useState(1);
  const [scheduledAt, setScheduledAt] = useState("");
  const [prePollSeconds, setPrePollSeconds] = useState(45);
  const [maxFeeGwei, setMaxFeeGwei] = useState("5");
  const [maxPriorityGwei, setMaxPriorityGwei] = useState("2");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function arm() {
    setLoading(true);
    setStatus(null);
    try {
      const iso = new Date(scheduledAt).toISOString();

      let maxFeePerGasWei: string | null = null;
      let maxPriorityFeePerGasWei: string | null = null;

      if (maxFeeGwei.trim()) {
        maxFeePerGasWei = parseGwei(maxFeeGwei.trim()).toString();
      }
      if (maxPriorityGwei.trim()) {
        maxPriorityFeePerGasWei = parseGwei(maxPriorityGwei.trim()).toString();
      }

      const res = await fetch("/api/seadrop/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          minter,
          quantity,
          scheduledAt: iso,
          prePollSeconds,
          maxFeePerGasWei,
          maxPriorityFeePerGasWei,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to arm");
      setStatus(
        `Armed. Job ${data.id}. Polling ${prePollSeconds}s early. maxFee=${maxFeeGwei || "auto"} gwei, priority=${maxPriorityGwei || "auto"} gwei.`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <h3 className="font-medium">Schedule unattended fire</h3>
      <p className="text-xs text-muted-foreground">
        Uses OPERATOR_PRIVATE_KEY on the server. Set priority gwei high enough
        for competitive FCFS so the tx is not stuck behind other bots.
      </p>

      <div>
        <label className="text-sm font-medium">Collection slug</label>
        <input
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Allowlisted minter</label>
        <input
          className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
          value={minter}
          onChange={(e) => setMinter(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Quantity</label>
        <input
          type="number"
          min={1}
          max={20}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Stage open time (local)</label>
        <input
          type="datetime-local"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Pre-poll seconds</label>
        <input
          type="number"
          min={10}
          max={300}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={prePollSeconds}
          onChange={(e) => setPrePollSeconds(Number(e.target.value))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Max fee (gwei)</label>
          <input
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            value={maxFeeGwei}
            onChange={(e) => setMaxFeeGwei(e.target.value)}
            placeholder="e.g. 5"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Priority fee (gwei)</label>
          <input
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            value={maxPriorityGwei}
            onChange={(e) => setMaxPriorityGwei(e.target.value)}
            placeholder="e.g. 2"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave blank for node-suggested gas. For hyped FCFS, raise priority
        (and max fee above it). Max fee must be ≥ priority fee.
      </p>

      <Button onClick={arm} disabled={loading || !scheduledAt}>
        {loading ? "Arming…" : "Arm scheduled fire"}
      </Button>

      {status && <p className="text-sm">{status}</p>}
    </div>
  );
}