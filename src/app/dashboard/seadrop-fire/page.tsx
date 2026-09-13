"use client";

import { useState } from "react";
import { useSeaDropFire } from "@/hooks/useSeaDropFire";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Address } from "viem";

export default function SeaDropFirePage() {
  const [slug, setSlug] = useState("exit-founders");
  const [minter, setMinter] = useState(
    "0x1c4abb26936c050a864e23017881e588ddb4e9f4",
  );
  const [quantity, setQuantity] = useState(1);

  const { fire, cancel, status, attempt, lastError, result } = useSeaDropFire();

  const handleFire = (wait: boolean) => {
    fire({
      slug,
      minter: minter as Address,
      quantity,
      waitForStage: wait,
      intervalMs: 250,
      timeoutMs: 300_000,
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>SeaDrop High-Speed Fire</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Collection slug</label>
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Allowlisted minter (proof is for this address)
            </label>
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
              className="mt-1 w-full rounded border px-3 py-2"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => handleFire(true)}
              disabled={status === "polling" || status === "sending"}
            >
              {status === "polling"
                ? `Polling… (attempt ${attempt})`
                : "Arm & Fire (wait for stage)"}
            </Button>

            <Button
              variant="outline"
              onClick={() => handleFire(false)}
              disabled={status === "polling" || status === "sending"}
            >
              Fire Now (no wait)
            </Button>

            {(status === "polling" || status === "sending") && (
              <Button variant="destructive" onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>

          {status === "success" && result && (
            <div className="rounded bg-green-50 p-3 text-sm">
              <p className="font-medium text-green-800">Mint submitted!</p>
              <p className="mt-1 break-all font-mono text-xs">
                Tx: {result.txHash}
              </p>
            </div>
          )}

          {status === "error" && lastError && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-800">
              {lastError}
            </div>
          )}

          {status === "polling" && lastError && (
            <div className="rounded bg-yellow-50 p-3 text-xs text-yellow-800">
              Last attempt: {lastError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}