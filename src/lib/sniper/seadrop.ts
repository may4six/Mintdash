import type { Address, PublicClient } from "viem";
import { resolveSeaDropFeeRecipient } from "./feeRecipient";

/**
 * SeaDrop's standard deployment address.
 */
export const CANONICAL_SEADROP_ADDRESS: Address =
  "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";

export const ALLOWED_SEADROP_UPDATED_EVENT = {
  type: "event",
  name: "AllowedSeaDropUpdated",
  inputs: [
    {
      name: "allowedSeaDrop",
      type: "address[]",
      indexed: false,
    },
  ],
} as const;

export const SEADROP_READ_ABI = [
  {
    type: "function",
    name: "getPublicDrop",
    stateMutability: "view",
    inputs: [
      {
        name: "nftContract",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "mintPrice", type: "uint80" },
          { name: "startTime", type: "uint48" },
          { name: "endTime", type: "uint48" },
          {
            name: "maxTotalMintableByWallet",
            type: "uint16",
          },
          { name: "feeBps", type: "uint16" },
          {
            name: "restrictFeeRecipients",
            type: "bool",
          },
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

  feeBps: number;
  restrictFeeRecipients: boolean;

  feeRecipient: Address | null;
  feeRecipientSource:
    | "allowed-recipient"
    | "opensea-default"
    | "unresolved";

  feeRecipientReason?: string;

  discoveredAtBlock: bigint;
}

export async function scanForNewSeaDropContracts(
  client: PublicClient,
  chainId: number,
  fromBlock: bigint,
  toBlock: bigint,
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

      const feeResolution = await resolveSeaDropFeeRecipient(
        client,
        nftContract,
        drop.restrictFeeRecipients,
      );

      results.push({
        nftContract,
        chainId,

        mintPriceWei: drop.mintPrice,
        startTime: Number(drop.startTime),
        endTime: Number(drop.endTime),
        maxPerWallet: Number(drop.maxTotalMintableByWallet),

        feeBps: Number(drop.feeBps),
        restrictFeeRecipients: drop.restrictFeeRecipients,

        feeRecipient: feeResolution.address,
        feeRecipientSource: feeResolution.source,

        ...(feeResolution.address === null
          ? { feeRecipientReason: feeResolution.reason }
          : {}),

        discoveredAtBlock: log.blockNumber ?? toBlock,
      });
    } catch (error) {
      console.warn(
        `[SeaDrop] Failed resolving ${nftContract}:`,
        error,
      );
    }
  }

  return results;
}

export function matchesNftRule(
  drop: DiscoveredDrop,
  maxPriceWei: bigint,
  nowSeconds: number,
): boolean {
  if (drop.mintPriceWei > maxPriceWei) return false;

  if (
    drop.startTime > 0 &&
    nowSeconds < drop.startTime
  ) {
    return false;
  }

  if (
    drop.endTime > 0 &&
    nowSeconds > drop.endTime
  ) {
    return false;
  }

  return true;
}