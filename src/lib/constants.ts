import { mainnet, sepolia } from "wagmi/chains";
import type { Chain } from "viem";

export interface ChainMeta {
  id: number;
  chain: Chain;
  label: string;
  shortLabel: string;
  isTestnet: boolean;
  explorerBase: string;
}

export const SUPPORTED_CHAINS: ChainMeta[] = [
  {
    id: mainnet.id,
    chain: mainnet,
    label: "Ethereum Mainnet",
    shortLabel: "Mainnet",
    isTestnet: false,
    explorerBase: "https://etherscan.io",
  },
  {
    id: sepolia.id,
    chain: sepolia,
    label: "Sepolia Testnet",
    shortLabel: "Sepolia",
    isTestnet: true,
    explorerBase: "https://sepolia.etherscan.io",
  },
];

export const DEFAULT_CHAIN_ID = sepolia.id;

export function getChainMeta(chainId: number): ChainMeta {
  const meta = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!meta) {
    throw new Error(`Unsupported chainId: ${chainId}. Add it to SUPPORTED_CHAINS in src/lib/constants.ts.`);
  }
  return meta;
}

export function explorerAddressUrl(chainId: number, address: string): string {
  return `${getChainMeta(chainId).explorerBase}/address/${address}`;
}

export function explorerTxUrl(chainId: number, hash: string): string {
  return `${getChainMeta(chainId).explorerBase}/tx/${hash}`;
}

/** Name fragments used to rank which ABI functions are likely mint entrypoints. */
export const MINT_FUNCTION_NAME_HINTS = [
  "mint",
  "publicmint",
  "whitelistmint",
  "allowlistmint",
  "presalemint",
  "claim",
  "safemint",
  "purchase",
] as const;

/** Param name fragments used to detect an explicit mint-recipient argument. */
export const RECIPIENT_PARAM_NAME_HINTS = [
  "to",
  "recipient",
  "receiver",
  "account",
  "wallet",
  "beneficiary",
  "minter",
] as const;

/** View-function name fragments checked as a best-effort whitelist signal. */
export const ELIGIBILITY_VIEW_NAME_HINTS = [
  "iswhitelisted",
  "isallowlisted",
  "iseligible",
  "allowlist",
  "whitelist",
] as const;

export const ACTIVITY_EVENT_TYPES = {
  WALLET_ADDED: "wallet_added",
  WALLET_REMOVED: "wallet_removed",
  CAMPAIGN_CREATED: "campaign_created",
  RUN_STARTED: "run_started",
  ITEM_SUBMITTED: "item_submitted",
  ITEM_CONFIRMED: "item_confirmed",
  ITEM_FAILED: "item_failed",
  RUN_COMPLETED: "run_completed",
} as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[keyof typeof ACTIVITY_EVENT_TYPES];

/** Conservative default so a preflight pass still leaves headroom for gas-price drift. */
export const GAS_SAFETY_MARGIN_BPS = 1500; // +15%
