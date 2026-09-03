import type { WalletRole, MintPhase, RunStatus, ItemStatus, EligibilityStatus } from "@prisma/client";

export type { WalletRole, MintPhase, RunStatus, ItemStatus, EligibilityStatus };

export interface WalletDTO {
  id: string;
  userId: string;
  chainId: number;
  address: string;
  label: string;
  role: WalletRole;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDTO {
  id: string;
  userId: string;
  chainId: number;
  name: string;
  contractAddress: string;
  abi: unknown;
  mintFunctionName: string;
  recipientParam: string | null;
  staticArgValues: Record<string, unknown> | null;
  phase: MintPhase;
  priceWeiPerMint: string;
  maxPerWallet: number | null;
  createdAt: string;
  updatedAt: string;
  receivers?: CampaignReceiverDTO[];
  runs?: MintRunDTO[];
}

export interface CampaignReceiverDTO {
  id: string;
  campaignId: string;
  walletId: string;
  eligibility: EligibilityStatus;
  eligibilityNote: string | null;
  wallet?: WalletDTO;
}

export interface MintRunDTO {
  id: string;
  campaignId: string;
  operatorWalletId: string;
  userId: string;
  status: RunStatus;
  maxFeePerGasWei: string | null;
  maxPriorityFeePerGasWei: string | null;
  estimatedTotalCostWei: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  items?: MintRunItemDTO[];
  campaign?: CampaignDTO;
  operator?: WalletDTO;
}

export interface MintRunItemDTO {
  id: string;
  runId: string;
  receiverWalletId: string;
  status: ItemStatus;
  txHash: string | null;
  errorMessage: string | null;
  gasUsedWei: string | null;
  effectiveGasPriceWei: string | null;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  receiver?: WalletDTO;
}

export interface ActivityEventDTO {
  id: string;
  userId: string;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Sniper / automation
// ─────────────────────────────────────────────────────────────────────────

export type SniperType = "NFT" | "TOKEN";
export type AutomationMode = "SHADOW" | "MANUAL";
export type MatchStatus = "OBSERVED" | "ARMED" | "EXECUTED" | "SKIPPED" | "EXPIRED";

export interface AutomationSettingsDTO {
  userId: string;
  automationEnabled: boolean;
  maxSpendPerDayWei: string | null;
  maxGasPriceWei: string | null;
  maxConcurrentRuns: number;
  updatedAt: string;
}

export interface SniperRuleDTO {
  id: string;
  userId: string;
  type: SniperType;
  chainId: number;
  name: string;
  enabled: boolean;
  maxPriceWei: string;
  maxGasPriceWei: string | null;
  quantityPerWallet: number;
  operatorWalletId: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  operator?: WalletDTO;
  receivers?: { id: string; walletId: string; wallet?: WalletDTO }[];
  _count?: { matches: number };
}

export interface SniperMatchDTO {
  id: string;
  ruleId: string;
  userId: string;
  contractAddress: string;
  chainId: number;
  status: MatchStatus;
  detectedAt: string;
  armedAt: string | null;
  executedRunId: string | null;
  skipReason: string | null;
  metadata: Record<string, unknown> | null;
  rule?: SniperRuleDTO;
}

/** Per-receiver preflight verdict returned by POST /api/preflight. */
export interface PreflightReceiverResult {
  walletId: string;
  address: string;
  gasEstimateWei: string | null;
  eligibility: EligibilityStatus;
  eligibilityNote: string | null;
  ready: boolean;
  blockReason: string | null;
}

export interface PreflightResult {
  contractHasCode: boolean;
  operator: {
    address: string;
    balanceWei: string;
    sufficientFunds: boolean;
    shortfallWei: string | null;
  };
  receivers: PreflightReceiverResult[];
  totalEstimatedCostWei: string;
  suggestedMaxFeePerGasWei: string;
  suggestedMaxPriorityFeePerGasWei: string;
  allReady: boolean;
  requiresReceiverSignature: boolean;
}

/** Client-side execution state for one receiver during a run — mirrors
 * MintRunItem but lives in React state for live UI updates before it's
 * persisted back via PATCH /api/runs/[id]/items. */
export interface MintExecutionItem {
  walletId: string;
  address: string;
  status: ItemStatus;
  txHash?: string;
  errorMessage?: string;
  gasUsedWei?: string;
  effectiveGasPriceWei?: string;
  attempt: number;
}
