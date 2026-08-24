"use client";

import type { ChangeEvent } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SUPPORTED_CHAINS, DEFAULT_CHAIN_ID } from "@/lib/constants";
import { Select } from "@/components/ui/form-elements";

export function ChainSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentChainId = Number(searchParams.get("chainId") ?? DEFAULT_CHAIN_ID);

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("chainId", e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={currentChainId} onChange={handleChange} className="w-44" aria-label="Active chain">
      {SUPPORTED_CHAINS.map((chain) => (
        <option key={chain.id} value={chain.id}>
          {chain.label}
          {chain.isTestnet ? " (testnet)" : ""}
        </option>
      ))}
    </Select>
  );
}
