import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
} from "wagmi/chains";
import { defineChain, type Chain } from "viem";

/** Robinhood Chain (EVM L2, chain id 4663) — not in default wagmi/chains */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

export interface ChainMeta {
  id: number;
  chain: Chain;
  label: string;
  shortLabel: string;
  isTestnet: boolean;
  explorerBase: string;
  alchemyNetwork: string;
}

export const SUPPORTED_CHAINS: ChainMeta[] = [
  {
    id: mainnet.id,
    chain: mainnet,
    label: "Ethereum Mainnet",
    shortLabel: "Ethereum",
    isTestnet: false,
    explorerBase: "https://etherscan.io",
    alchemyNetwork: "eth-mainnet",
  },
  {
    id: base.id,
    chain: base,
    label: "Base",
    shortLabel: "Base",
    isTestnet: false,
    explorerBase: "https://basescan.org",
    alchemyNetwork: "base-mainnet",
  },
  {
    id: arbitrum.id,
    chain: arbitrum,
    label: "Arbitrum One",
    shortLabel: "Arbitrum",
    isTestnet: false,
    explorerBase: "https://arbiscan.io",
    alchemyNetwork: "arb-mainnet",
  },
  {
    id: optimism.id,
    chain: optimism,
    label: "Optimism",
    shortLabel: "Optimism",
    isTestnet: false,
    explorerBase: "https://optimistic.etherscan.io",
    alchemyNetwork: "opt-mainnet",
  },
  {
    id: polygon.id,
    chain: polygon,
    label: "Polygon",
    shortLabel: "Polygon",
    isTestnet: false,
    explorerBase: "https://polygonscan.com",
    alchemyNetwork: "polygon-mainnet",
  },
  {
    id: robinhood.id,
    chain: robinhood,
    label: "Robinhood Chain",
    shortLabel: "Robinhood",
    isTestnet: false,
    explorerBase: "https://robinhoodchain.blockscout.com",
    alchemyNetwork: "robinhood-mainnet",
  },
  {
    id: sepolia.id,
    chain: sepolia,
    label: "Sepolia Testnet",
    shortLabel: "Sepolia",
    isTestnet: true,
    explorerBase: "https://sepolia.etherscan.io",
    alchemyNetwork: "eth-sepolia",
  },
  {
    id: baseSepolia.id,
    chain: baseSepolia,
    label: "Base Sepolia",
    shortLabel: "Base Sepolia",
    isTestnet: true,
    explorerBase: "https://sepolia.basescan.org",
    alchemyNetwork: "base-sepolia",
  },
  {
    id: arbitrumSepolia.id,
    chain: arbitrumSepolia,
    label: "Arbitrum Sepolia",
    shortLabel: "Arb Sepolia",
    isTestnet: true,
    explorerBase: "https://sepolia.arbiscan.io",
    alchemyNetwork: "arb-sepolia",
  },
  {
    id: optimismSepolia.id,
    chain: optimismSepolia,
    label: "Optimism Sepolia",
    shortLabel: "OP Sepolia",
    isTestnet: true,
    explorerBase: "https://sepolia-optimism.etherscan.io",
    alchemyNetwork: "opt-sepolia",
  },
  {
    id: polygonAmoy.id,
    chain: polygonAmoy,
    label: "Polygon Amoy",
    shortLabel: "Amoy",
    isTestnet: true,
    explorerBase: "https://amoy.polygonscan.com",
    alchemyNetwork: "polygon-amoy",
  },
  {
    id: robinhoodTestnet.id,
    chain: robinhoodTestnet,
    label: "Robinhood Testnet",
    shortLabel: "RH Testnet",
    isTestnet: true,
    explorerBase: "https://explorer.testnet.chain.robinhood.com",
    alchemyNetwork: "robinhood-testnet",
  },
];

export const DEFAULT_CHAIN_ID = sepolia.id;

/** Basis points added on top of estimated gas (e.g. 2000 = +20%) */
export const GAS_SAFETY_MARGIN_BPS = 2000n;

export function getChainMeta(chainId: number): ChainMeta {
  const meta = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!meta) {
    throw new Error(
      `Unsupported chainId: ${chainId}. Add it to SUPPORTED_CHAINS in src/lib/constants.ts.`
    );
  }
  return meta;
}

/** Build Alchemy HTTPS RPC from one NEXT_PUBLIC_ALCHEMY_API_KEY */
export function getRpcUrl(chainId: number): string | undefined {
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  if (!apiKey) return undefined;
  const meta = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!meta) return undefined;
  return `https://${meta.alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;
}

export function explorerAddressUrl(chainId: number, address: string): string {
  const meta = getChainMeta(chainId);
  return `${meta.explorerBase}/address/${address}`;
}

export function explorerTxUrl(chainId: number, txHash: string): string {
  const meta = getChainMeta(chainId);
  return `${meta.explorerBase}/tx/${txHash}`;
}

/** Common mint function name hints for ABI detection */
export const MINT_FUNCTION_NAME_HINTS = [
  "mint",
  "mintTo",
  "safeMint",
  "publicMint",
  "claim",
  "claimTo",
] as const;

/** Param names that usually mean “recipient / to” */
export const RECIPIENT_PARAM_NAME_HINTS = [
  "to",
  "to_",
  "recipient",
  "account",
  "addr",
  "address",
] as const;

/** View names used for allowlist / eligibility checks */
export const ELIGIBILITY_VIEW_NAME_HINTS = [
  "isEligible",
  "canMint",
  "isWhitelisted",
  "whitelist",
  "allowlist",
  "balanceOf",
] as const;

/** Activity feed event type keys used by API routes */
export const ACTIVITY_EVENT_TYPES = {
  CAMPAIGN_CREATED: "CAMPAIGN_CREATED",
  CAMPAIGN_UPDATED: "CAMPAIGN_UPDATED",
  RUN_STARTED: "RUN_STARTED",
  RUN_COMPLETED: "RUN_COMPLETED",
  RUN_FAILED: "RUN_FAILED",
  MINT_SUCCESS: "MINT_SUCCESS",
  MINT_FAILED: "MINT_FAILED",
  WALLET_ADDED: "WALLET_ADDED",
  WALLET_REMOVED: "WALLET_REMOVED",
} as const;

export type ActivityEventType =
  (typeof ACTIVITY_EVENT_TYPES)[keyof typeof ACTIVITY_EVENT_TYPES];
