import { z } from "zod";
import { isAddress } from "viem";

/** viem's isAddress also validates EIP-55 checksum casing when mixed-case. */
export const addressSchema = z
  .string()
  .trim()
  .refine((val) => isAddress(val), { message: "Not a valid EVM address" });

export const chainIdSchema = z.number().int().positive();

export const walletRoleSchema = z.enum(["OPERATOR", "RECEIVER"]);

export const createWalletSchema = z.object({
  address: addressSchema,
  label: z.string().trim().min(1, "Label is required").max(64),
  role: walletRoleSchema,
  chainId: chainIdSchema,
});
export type CreateWalletInput = z.infer<typeof createWalletSchema>;

export const updateWalletSchema = z.object({
  label: z.string().trim().min(1).max(64).optional(),
  role: walletRoleSchema.optional(),
});
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;

/** Loose structural check for an ABI: an array of objects with a "type" field. */
export const abiJsonSchema = z
  .array(z.record(z.string(), z.unknown()))
  .min(1, "ABI must contain at least one entry")
  .refine((entries) => entries.some((e) => e.type === "function"), {
    message: "ABI has no functions in it",
  });

const weiStringSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Must be a whole-number wei amount")
  .default("0");

export const mintPhaseSchema = z.enum(["PUBLIC", "WHITELIST"]);

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  chainId: chainIdSchema,
  contractAddress: addressSchema,
  abi: abiJsonSchema,
  mintFunctionName: z.string().trim().min(1, "Select a mint function"),
  recipientParam: z.string().trim().nullable(),
  staticArgValues: z.record(z.string(), z.unknown()).default({}),
  phase: mintPhaseSchema,
  priceWeiPerMint: weiStringSchema,
  maxPerWallet: z.number().int().positive().nullable().optional(),
  receiverWalletIds: z.array(z.string().min(1)).default([]),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const abiDetectSchema = z.object({
  chainId: chainIdSchema,
  address: addressSchema,
});
export type AbiDetectInput = z.infer<typeof abiDetectSchema>;

export const preflightRequestSchema = z.object({
  chainId: chainIdSchema,
  contractAddress: addressSchema,
  abi: abiJsonSchema,
  mintFunctionName: z.string().min(1),
  recipientParam: z.string().nullable(),
  staticArgs: z.record(z.string(), z.unknown()).default({}),
  phase: mintPhaseSchema,
  priceWeiPerMint: weiStringSchema,
  operatorAddress: addressSchema,
  receivers: z
    .array(z.object({ walletId: z.string().min(1), address: addressSchema }))
    .min(1, "Select at least one receiver"),
});
export type PreflightRequest = z.infer<typeof preflightRequestSchema>;

export const createRunSchema = z.object({
  campaignId: z.string().min(1),
  operatorWalletId: z.string().min(1),
  receiverWalletIds: z.array(z.string().min(1)).min(1),
  maxFeePerGasWei: weiStringSchema.optional(),
  maxPriorityFeePerGasWei: weiStringSchema.optional(),
  estimatedTotalCostWei: weiStringSchema.optional(),
});
export type CreateRunInput = z.infer<typeof createRunSchema>;

export const itemStatusSchema = z.enum(["PENDING", "SUBMITTED", "CONFIRMED", "FAILED"]);

export const updateRunItemSchema = z.object({
  itemId: z.string().min(1),
  status: itemStatusSchema,
  txHash: z.string().optional(),
  errorMessage: z.string().optional(),
  gasUsedWei: z.string().optional(),
  effectiveGasPriceWei: z.string().optional(),
  attempt: z.number().int().positive().optional(),
});
export type UpdateRunItemInput = z.infer<typeof updateRunItemSchema>;

export const logActivitySchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1).max(280),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type LogActivityInput = z.infer<typeof logActivitySchema>;

// ─────────────────────────────────────────────────────────────────────────
// Sniper / automation
// ─────────────────────────────────────────────────────────────────────────

export const automationSettingsSchema = z.object({
  automationEnabled: z.boolean(),
  maxSpendPerDayWei: weiStringSchema.optional().nullable(),
  maxGasPriceWei: weiStringSchema.optional().nullable(),
  maxConcurrentRuns: z.number().int().min(1).max(20).default(1),
});
export type AutomationSettingsInput = z.infer<typeof automationSettingsSchema>;

export const sniperTypeSchema = z.enum(["NFT", "TOKEN"]);
export const automationModeSchema = z.enum(["SHADOW", "MANUAL"]);
export const matchStatusSchema = z.enum(["OBSERVED", "ARMED", "EXECUTED", "SKIPPED", "EXPIRED"]);

export const createSniperRuleSchema = z.object({
  type: sniperTypeSchema,
  chainId: chainIdSchema,
  name: z.string().trim().min(1).max(100),
  maxPriceWei: weiStringSchema,
  maxGasPriceWei: weiStringSchema.optional(),
  quantityPerWallet: z.number().int().min(1).max(50).default(1),
  operatorWalletId: z.string().min(1),
  receiverWalletIds: z.array(z.string().min(1)).min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateSniperRuleInput = z.infer<typeof createSniperRuleSchema>;

export const updateSniperRuleSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  maxPriceWei: weiStringSchema.optional(),
  maxGasPriceWei: weiStringSchema.optional().nullable(),
  quantityPerWallet: z.number().int().min(1).max(50).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateSniperRuleInput = z.infer<typeof updateSniperRuleSchema>;

export const updateSniperMatchSchema = z.object({
  status: matchStatusSchema,
  skipReason: z.string().max(280).optional(),
  executedRunId: z.string().optional(),
});
export type UpdateSniperMatchInput = z.infer<typeof updateSniperMatchSchema>;
