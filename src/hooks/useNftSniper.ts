"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { scanForNewSeaDropContracts, matchesNftRule } from "@/lib/sniper/seadrop";
import { useAutomationSettings } from "@/hooks/useAutomationSettings";
import type { SniperRuleDTO, SniperMatchDTO } from "@/types";

/** Polling interval for the detector. This is a best-effort, RPC-log-based
 * scanner — not mempool-level, sub-second sniping infrastructure. Treat it
 * as "notices new drops within roughly this window," not as a latency
 * guarantee. */
const SCAN_INTERVAL_MS = 20_000;
const BLOCK_LOOKBACK = 500n;

async function fetchRules(chainId?: number): Promise<SniperRuleDTO[]> {
  const params = new URLSearchParams({ type: "NFT" });
  if (chainId) params.set("chainId", String(chainId));
  const res = await fetch(`/api/sniper/rules?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load sniper rules");
  const data = (await res.json()) as { rules: SniperRuleDTO[] };
  return data.rules;
}

async function fetchMatches(): Promise<SniperMatchDTO[]> {
  const res = await fetch("/api/sniper/matches?limit=100");
  if (!res.ok) throw new Error("Failed to load matches");
  const data = (await res.json()) as { matches: SniperMatchDTO[] };
  return data.matches;
}

export function useNftSniper(chainId: number) {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId });
  const { settings } = useAutomationSettings();

  const rulesQuery = useQuery({ queryKey: ["sniper-rules", "NFT", chainId], queryFn: () => fetchRules(chainId) });
  const matchesQuery = useQuery({
    queryKey: ["sniper-matches"],
    queryFn: fetchMatches,
    refetchInterval: 10_000,
  });

  const lastBlockRef = useRef<bigint | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const runScan = useCallback(async () => {
    if (!publicClient || !settings?.automationEnabled) return;
    const enabledRules = (rulesQuery.data ?? []).filter((r) => r.enabled && r.chainId === chainId);
    if (enabledRules.length === 0) return;

    setIsScanning(true);
    try {
      const toBlock = await publicClient.getBlockNumber();
      const fromBlock =
        lastBlockRef.current !== null
          ? lastBlockRef.current + 1n
          : toBlock > BLOCK_LOOKBACK
            ? toBlock - BLOCK_LOOKBACK
            : 0n;
      if (fromBlock > toBlock) return;

      const drops = await scanForNewSeaDropContracts(publicClient, chainId, fromBlock, toBlock);
      lastBlockRef.current = toBlock;

      const nowSeconds = Math.floor(Date.now() / 1000);
      for (const rule of enabledRules) {
        const maxPriceWei = BigInt(rule.maxPriceWei);
        for (const drop of drops) {
          if (!matchesNftRule(drop, maxPriceWei, nowSeconds)) continue;
          await fetch("/api/sniper/matches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ruleId: rule.id,
              contractAddress: drop.nftContract,
              chainId,
              metadata: {
                mintPriceWei: drop.mintPriceWei.toString(),
                maxPerWallet: drop.maxPerWallet,
                startTime: drop.startTime,
                endTime: drop.endTime,
              },
            }),
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["sniper-matches"] });
    } catch (err) {
      console.error("[useNftSniper] scan failed", err);
    } finally {
      setIsScanning(false);
    }
  }, [publicClient, rulesQuery.data, settings?.automationEnabled, chainId, queryClient]);

  useEffect(() => {
    if (!settings?.automationEnabled) return;
    void runScan();
    const interval = setInterval(() => void runScan(), SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [settings?.automationEnabled, runScan]);

  return {
    rules: rulesQuery.data ?? [],
    isLoadingRules: rulesQuery.isLoading,
    matches: matchesQuery.data ?? [],
    isLoadingMatches: matchesQuery.isLoading,
    isScanning,
    invalidateRules: () => queryClient.invalidateQueries({ queryKey: ["sniper-rules", "NFT", chainId] }),
    invalidateMatches: () => queryClient.invalidateQueries({ queryKey: ["sniper-matches"] }),
  };
}
