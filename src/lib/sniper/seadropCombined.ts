import type { Abi, Address } from "viem";
import { CANONICAL_SEADROP_ADDRESS } from "./seadrop";
import { SEADROP_MINT_PUBLIC_ABI, SEADROP_RECIPIENT_PARAM } from "./seadropMintPublic";
import {
  SEADROP_ALLOWLIST_MINT_ABI,
  SEADROP_ALLOWLIST_RECIPIENT_PARAM,
} from "./seadropAllowList";

/**
 * Combined SeaDrop mint entrypoints for the campaign wizard.
 * Paste/inject this so the function dropdown shows mintPublic + mintAllowList.
 * Calls always go to CANONICAL_SEADROP_ADDRESS; the NFT is only an argument.
 */
export const SEADROP_COMBINED_MINT_ABI: Abi = [
  ...(SEADROP_MINT_PUBLIC_ABI as Abi),
  ...(SEADROP_ALLOWLIST_MINT_ABI as Abi),
];

export { CANONICAL_SEADROP_ADDRESS, SEADROP_RECIPIENT_PARAM, SEADROP_ALLOWLIST_RECIPIENT_PARAM };

export function isSeaDropMintFunction(name: string): boolean {
  return name === "mintPublic" || name === "mintAllowList";
}

export function isCanonicalSeaDropAddress(address: string): boolean {
  return address.toLowerCase() === CANONICAL_SEADROP_ADDRESS.toLowerCase();
}

/** Default static arg keys users must fill for mintPublic. */
export function defaultPublicStaticArgs(nftContract: string): Record<string, string> {
  return {
    nftContract,
    feeRecipient: "",
    quantity: "1",
  };
}