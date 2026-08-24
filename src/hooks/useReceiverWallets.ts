"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletDTO, WalletRole } from "@/types";

async function fetchWallets(chainId: number, role?: WalletRole): Promise<WalletDTO[]> {
  const params = new URLSearchParams({ chainId: String(chainId) });
  if (role) params.set("role", role);
  const res = await fetch(`/api/wallets?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load wallets");
  const data = (await res.json()) as { wallets: WalletDTO[] };
  return data.wallets;
}

export function walletsQueryKey(chainId: number, role?: WalletRole) {
  return ["wallets", chainId, role ?? "all"] as const;
}

/** All RECEIVER-role wallets on a chain. */
export function useReceiverWallets(chainId: number) {
  return useQuery({
    queryKey: walletsQueryKey(chainId, "RECEIVER"),
    queryFn: () => fetchWallets(chainId, "RECEIVER"),
  });
}

/** All OPERATOR-role wallets on a chain. */
export function useOperatorWallets(chainId: number) {
  return useQuery({
    queryKey: walletsQueryKey(chainId, "OPERATOR"),
    queryFn: () => fetchWallets(chainId, "OPERATOR"),
  });
}

/** Every wallet on a chain, any role — used by the Wallets page. */
export function useAllWallets(chainId: number) {
  return useQuery({
    queryKey: walletsQueryKey(chainId),
    queryFn: () => fetchWallets(chainId),
  });
}

/** Call after any wallet mutation so every wallet-list view refetches. */
export function useInvalidateWallets() {
  const queryClient = useQueryClient();
  return (chainId: number) => queryClient.invalidateQueries({ queryKey: ["wallets", chainId] });
}
