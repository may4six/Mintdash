"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SchedulePanel() {
  const [slug, setSlug] = useState("exit-founders");
  const [minter, setMinter] = useState(
    "0x1c4abb26936c050a864e23017881e588ddb4e9f4",
  );
  const [quantity, setQuantity] = useState(1);
  const [scheduledAt, setScheduledAt] = useState("");
  const [prePollSeconds, setPrePollSeconds] = useState(45);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function arm() {
    setLoading(true);
    setStatus(null);
    try {
      const iso = new Date(scheduledAt).toISOString();
      const res = await fetch("/api/seadrop/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          minter,
          quantity,
          scheduledAt: iso,
          prePollSeconds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to arm");
      setStatus(
        `Armed. Job ${data.id}. Polling starts ${prePollSeconds}s before open.`,
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
        Uses OPERATOR_PRIVATE_KEY on the server. No wallet popup. Works while
        you are away. Cron must hit /api/cron/tick.
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
        <label className="text-sm font-medium">
          Stage open time (local)
        </label>
        <input
          type="datetime-local"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Pre-poll seconds (start polling this early)
        </label>
        <input
          type="number"
          min={10}
          max={300}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={prePollSeconds}
          onChange={(e) => setPrePollSeconds(Number(e.target.value))}
        />
      </div>

      <Button onClick={arm} disabled={loading || !scheduledAt}>
        {loading ? "Arming…" : "Arm scheduled fire"}
      </Button>

      {status && <p className="text-sm">{status}</p>}
    </div>
  );
}