"use client";

import { useState, useCallback, useRef } from "react";
import { useWalletClient, usePublicClient } from "wagmi";
import { fireSeaDropMint, type FireResult } from "@/lib/opensea/fire";
import type { Address } from "viem";

export interface UseSeaDropFireOptions {
  slug: string;
  minter: Address;
  quantity?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

export function useSeaDropFire() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<
    "idle" | "polling" | "sending" | "success" | "error"
  >("idle");
  const [attempt, setAttempt] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [result, setResult] = useState<FireResult | null>(null);
  const abortRef = useRef(false);

  const fire = useCallback(
    async (opts: UseSeaDropFireOptions & { waitForStage?: boolean }) => {
      if (!walletClient || !publicClient) {
        setLastError("Wallet or public client not ready");
        setStatus("error");
        return;
      }

      abortRef.current = false;
      setStatus(opts.waitForStage ? "polling" : "sending");
      setLastError(null);
      setResult(null);
      setAttempt(0);

      try {
        const res = await fireSeaDropMint(walletClient, publicClient, {
          slug: opts.slug,
          minter: opts.minter,
          quantity: opts.quantity ?? 1,
          waitForStage: opts.waitForStage ?? true,
          intervalMs: opts.intervalMs ?? 300,
          timeoutMs: opts.timeoutMs ?? 180_000,
          onAttempt: (n, err) => {
            if (abortRef.current) return;
            setAttempt(n);
            if (err) setLastError(err);
          },
        });

        if (abortRef.current) return;

        setResult(res);
        setStatus("success");
      } catch (err) {
        if (abortRef.current) return;
        setLastError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    },
    [walletClient, publicClient],
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
  }, []);

  return {
    fire,
    cancel,
    status,
    attempt,
    lastError,
    result,
  };
}