import type { Address, PublicClient } from "viem";
import { CANONICAL_SEADROP_ADDRESS } from "./seadrop";

const FEE_RECIPIENT_ABI = [
  {
    type: "function",
    name: "getAllowedFeeRecipients",
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
        type: "address[]",
      },
    ],
  },
] as const;

/**
 * SeaDrop's standard OpenSea fee recipient.
 *
 * This is only used when the drop does NOT restrict fee recipients
 * and SeaDrop therefore accepts any non-zero recipient.
 */
export const OPENSEA_FEE_RECIPIENT =
  "0x0000a26b00c1F0DF003000390027140000fAa719" as Address;

export type FeeRecipientResolution =
  | {
      address: Address;
      source: "allowed-recipient" | "opensea-default";
    }
  | {
      address: null;
      source: "unresolved";
      reason: string;
    };

export async function resolveSeaDropFeeRecipient(
  client: PublicClient,
  nftContract: Address,
  restrictFeeRecipients: boolean,
): Promise<FeeRecipientResolution> {
  const allowed = await client.readContract({
    address: CANONICAL_SEADROP_ADDRESS,
    abi: FEE_RECIPIENT_ABI,
    functionName: "getAllowedFeeRecipients",
    args: [nftContract],
  });

  /**
   * If SeaDrop has an explicitly enumerated recipient,
   * use the on-chain value rather than guessing.
   */
  if (allowed.length > 0) {
    return {
      address: allowed[0],
      source: "allowed-recipient",
    };
  }

  /**
   * When recipients are restricted but none are configured,
   * there is no safe address for the bot to invent.
   */
  if (restrictFeeRecipients) {
    return {
      address: null,
      source: "unresolved",
      reason: "SeaDrop restricts fee recipients but exposes no allowed recipient.",
    };
  }

  /**
   * SeaDrop only requires a non-zero recipient when restriction
   * is disabled. Use the standard OpenSea recipient.
   */
  return {
    address: OPENSEA_FEE_RECIPIENT,
    source: "opensea-default",
  };
}