import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CANONICAL_SEADROP_ADDRESS } from "@/lib/sniper/seadrop";
import {
  SEADROP_MINT_PUBLIC_ABI,
  SEADROP_RECIPIENT_PARAM,
  SEADROP_ZERO_FEE_RECIPIENT,
} from "@/lib/sniper/seadropMintPublic";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";

type MatchWithRule = {
  id: string;
  userId: string;
  chainId: number;
  contractAddress: string;
  metadata: unknown;
  rule: {
    id: string;
    name: string;
    maxPriceWei: string;
    quantityPerWallet: number;
    operatorWalletId: string;
    receivers: { walletId: string }[];
    config: unknown;
  };
};

function feeRecipientFromRule(config: unknown): string {
  if (config && typeof config === "object" && "feeRecipient" in config) {
    const v = (config as { feeRecipient?: string }).feeRecipient;
    if (v && /^0x[0-9a-fA-F]{40}$/.test(v)) return v;
  }
  return SEADROP_ZERO_FEE_RECIPIENT;
}

/** Same payload as ArmSnipeDialog.handleConfirm — server-side. */
export async function createCampaignFromSniperMatch(match: MatchWithRule) {
  const rule = match.rule;
  const mintPriceWei = String(
    (match.metadata as { mintPriceWei?: string } | null)?.mintPriceWei ??
      rule.maxPriceWei ??
      "0"
  );
  const quantity = rule.quantityPerWallet ?? 1;
  const feeRecipient = feeRecipientFromRule(rule.config);
  const receiverWalletIds = rule.receivers.map((r) => r.walletId);

  if (receiverWalletIds.length === 0) {
    throw new Error("Sniper rule has no receiver wallets");
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId: match.userId,
      chainId: match.chainId,
      name: `Snipe: ${shortenAddress(match.contractAddress)}`,
      contractAddress: CANONICAL_SEADROP_ADDRESS,
      abi: SEADROP_MINT_PUBLIC_ABI as unknown as Prisma.InputJsonValue,
      mintFunctionName: "mintPublic",
      recipientParam: SEADROP_RECIPIENT_PARAM,
      staticArgValues: {
        nftContract: match.contractAddress,
        feeRecipient,
        quantity: String(quantity),
      } as unknown as Prisma.InputJsonValue,
      phase: "PUBLIC",
      priceWeiPerMint: mintPriceWei,
      maxPerWallet: null,
      receivers: {
        create: receiverWalletIds.map((walletId) => ({ walletId })),
      },
    },
    include: { receivers: { include: { wallet: true } } },
  });

  await prisma.activityEvent.create({
    data: {
      userId: match.userId,
      type: ACTIVITY_EVENT_TYPES.CAMPAIGN_CREATED,
      message: `Auto-snipe created campaign "${campaign.name}"`,
      metadata: { campaignId: campaign.id, matchId: match.id, ruleId: rule.id },
    },
  });

  return { campaign, operatorWalletId: rule.operatorWalletId, feeRecipient };
}