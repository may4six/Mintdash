"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";

/**
 * Fetches native ETH balances for many addresses at once on one chain.
 * Individual eth_getBalance calls run in parallel rather than being routed
 * through a Multicall3 contract — simpler to reason about correctly, and
 * plenty fast for the wallet counts a console like this deals with.
 */
export function useWalletBalances(addresses: Address[], chainId: number) {
  const publicClient = usePublicClient({ chainId });
  const key = addresses.map((a) => a.toLowerCase()).sort().join(",");

  return useQuery({
    queryKey: ["wallet-balances", chainId, key],
    queryFn: async () => {
      if (!publicClient) return {} as Record<string, bigint>;
      const entries = await Promise.all(
        addresses.map(async (address) => {
          try {
            const balance = await publicClient.getBalance({ address });
            return [address.toLowerCase(), balance] as const;
          } catch {
            return [address.toLowerCase(), null] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<string, bigint | null>;
    },
    enabled: !!publicClient && addresses.length > 0,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
