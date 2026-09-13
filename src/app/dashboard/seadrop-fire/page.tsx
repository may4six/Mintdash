"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { useSeaDropFire } from "@/hooks/useSeaDropFire";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { robinhood } from "@/lib/constants";
import type { Address } from "viem";

export default function SeaDropFirePage() {
  const [slug, setSlug] = useState("exit-founders");
  const [minter, setMinter] = useState(
    "0x1c4abb26936c050a864e23017881e588ddb4e9f4",
  );
  const [quantity, setQuantity] = useState(1);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const { fire, cancel, status, attempt, lastError, result } = useSeaDropFire();

  const isWrongChain = isConnected && chainId !== robinhood.id;

  const handleFire = (wait: boolean) => {
    if (!isConnected) return;
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
          {/* Wallet status */}
          <div className="rounded-md border p-3 text-sm">
            {!isConnected ? (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Connect the Operator wallet that will pay gas.
                </p>
                <div className="flex flex-wrap gap-2">
                  {connectors.map((c) => (
                    <Button
                      key={c.uid}
                      size="sm"
                      disabled={isConnecting}
                      onClick={() => connect({ connector: c })}
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">Connected</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {address}
                  </p>
                  {isWrongChain && (
                    <p className="mt-1 text-xs text-yellow-600">
                      Wrong network — switch to Robinhood Chain
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {isWrongChain && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => switchChain({ chainId: robinhood.id })}
                    >
                      Switch to Robinhood
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => disconnect()}>
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
          </div>

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

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleFire(true)}
              disabled={
                !isConnected ||
                isWrongChain ||
                status === "polling" ||
                status === "sending"
              }
            >
              {status === "polling"
                ? `Polling… (attempt ${attempt})`
                : "Arm & Fire (wait for stage)"}
            </Button>

            <Button
              variant="outline"
              onClick={() => handleFire(false)}
              disabled={
                !isConnected ||
                isWrongChain ||
                status === "polling" ||
                status === "sending"
              }
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
            <div className="rounded bg-green-50 p-3 text-sm dark:bg-green-950">
              <p className="font-medium text-green-800 dark:text-green-200">
                Mint submitted!
              </p>
              <p className="mt-1 break-all font-mono text-xs">
                Tx: {result.txHash}
              </p>
            </div>
          )}

          {status === "error" && lastError && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              {lastError}
            </div>
          )}

          {status === "polling" && lastError && (
            <div className="rounded bg-yellow-50 p-3 text-xs text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              Last attempt: {lastError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}