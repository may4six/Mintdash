import type { Address, PublicClient } from "viem";

/**
 * SeaDrop detection, built from OpenSea's public seadrop repo
 * (github.com/ProjectOpenSea/seadrop) and its Etherscan/Polygonscan-verified
 * deployment. Two things here carry real uncertainty and should be checked
 * against a block explorer before trusting this with real funds:
 *
 * 1. CANONICAL_SEADROP_ADDRESS — SeaDrop is deployed at the same address on
 *    every chain OpenSea has rolled it out to, via a deterministic deployer.
 *    That does NOT guarantee it exists on every chain you add here — check
 *    the target chain's explorer for code at this address first. A
 *    brand-new chain (Robinhood Chain, at launch) may not have it yet.
 * 2. The PublicDrop struct's exact field layout below is reconstructed from
 *    the public interface, not decoded from a live call during development
 *    (this environment has no network access). If a chain's SeaDrop returns
 *    something shaped differently, getPublicDropTerms() below will throw —
 *    it's written to fail loudly (caught by the caller) rather than return
 *    silently-wrong numbers.
 */
export const CANONICAL_SEADROP_ADDRESS: Address = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";

/** Emitted by an NFT contract itself when it registers with SeaDrop —
 * watching for this with no `address` filter is how new drops are found at
 * all, since there's no registry of "every SeaDrop NFT contract" to poll. */
export const ALLOWED_SEADROP_UPDATED_EVENT = {
  type: "event",
  name: "AllowedSeaDropUpdated",
  inputs: [{ name: "allowedSeaDrop", type: "address[]", indexed: false }],
} as const;

/** Minimal ABI slice for reading current public-drop terms once a candidate
 * NFT contract has been found. */
export const SEADROP_READ_ABI = [
  {
    type: "function",
    name: "getPublicDrop",
    stateMutability: "view",
    inputs: [{ name: "nftContract", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "mintPrice", type: "uint80" },
          { name: "startTime", type: "uint48" },
          { name: "endTime", type: "uint48" },
          { name: "maxTotalMintableByWallet", type: "uint16" },
          { name: "feeBps", type: "uint16" },
          { name: "restrictFeeRecipients", type: "bool" },
        ],
      },
    ],
  },
] as const;

export interface DiscoveredDrop {
  nftContract: Address;
  chainId: number;
  mintPriceWei: bigint;
  startTime: number;
  endTime: number;
  maxPerWallet: number;
  discoveredAtBlock: bigint;
}

/**
 * Scans a recent block range for AllowedSeaDropUpdated events (new
 * SeaDrop-enabled contracts announcing themselves), then reads current
 * drop terms for each one found. Intended to be called on an interval from
 * the client — see useNftSniper.
 */
export async function scanForNewSeaDropContracts(
  client: PublicClient,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint
): Promise<DiscoveredDrop[]> {
  const logs = await client.getLogs({
    event: ALLOWED_SEADROP_UPDATED_EVENT,
    fromBlock,
    toBlock,
  });

  const results: DiscoveredDrop[] = [];
  for (const log of logs) {
    const nftContract = log.address;
    try {
      const drop = await client.readContract({
        address: CANONICAL_SEADROP_ADDRESS,
        abi: SEADROP_READ_ABI,
        functionName: "getPublicDrop",
        args: [nftContract],
      });
      results.push({
        nftContract,
        chainId,
        mintPriceWei: drop.mintPrice,
        startTime: Number(drop.startTime),
        endTime: Number(drop.endTime),
        maxPerWallet: Number(drop.maxTotalMintableByWallet),
        discoveredAtBlock: log.blockNumber ?? toBlock,
      });
    } catch {
      // Contract registered with SOME SeaDrop-shaped implementation but
      // this specific read didn't match what we expect — skip it rather
      // than surface a bad guess. Shows up in the rule's skip log, not
      // as a false match.
    }
  }
  return results;
}

/** True when a discovered drop satisfies a rule's price/timing filters. */
export function matchesNftRule(drop: DiscoveredDrop, maxPriceWei: bigint, nowSeconds: number): boolean {
  if (drop.mintPriceWei > maxPriceWei) return false;
  if (drop.startTime > 0 && nowSeconds < drop.startTime) return false;
  if (drop.endTime > 0 && nowSeconds > drop.endTime) return false;
  return true;
}
