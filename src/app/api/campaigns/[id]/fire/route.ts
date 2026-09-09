import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { executeSelfMintRun } from "@/lib/server/executeSelfMintRun";
import { hasReceiverKey } from "@/lib/server/receiverKeys";

/**
 * POST /api/campaigns/:id/fire
 * Best path when you are online at T0: starts prepare + wait + blast in this request.
 * Prefer this over waiting for cron if the mint is about to open.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, userId },
      include: { receivers: { include: { wallet: true } } },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.receivers.length === 0) {
      return NextResponse.json({ error: "No receivers" }, { status: 400 });
    }

    const missing = campaign.receivers
      .map((r) => r.wallet.address)
      .filter((a) => !hasReceiverKey(a));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing keys for: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const fireAt =
      campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()
        ? campaign.scheduledAt
        : null;

    const out = await executeSelfMintRun({
      campaignId: campaign.id,
      userId,
      bookkeepingWalletId: campaign.receivers[0]!.walletId,
      maxFeePerGasWei: campaign.scheduleMaxFeePerGasWei,
      maxPriorityFeePerGasWei: campaign.scheduleMaxPriorityFeePerGasWei,
      fireAt,
      syncChainStartTime: true,
    });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { scheduleStatus: "FIRED", autoExecute: false },
    });

    return NextResponse.json(out);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST fire]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fire failed" },
      { status: 500 }
    );
  }
}