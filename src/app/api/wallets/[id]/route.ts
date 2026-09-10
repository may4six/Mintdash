import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { updateWalletSchema } from "@/lib/validations";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await req.json();
    const input = updateWalletSchema.parse(body);

    const existing = await prisma.wallet.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    const wallet = await prisma.wallet.update({
      where: { id },
      data: input,
    });

    return NextResponse.json({ wallet });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[PATCH /api/wallets/[id]]", error);
    return NextResponse.json({ error: "Failed to update wallet" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await prisma.wallet.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Runs where this wallet was the operator
      const runs = await tx.mintRun.findMany({
        where: { operatorWalletId: id },
        select: { id: true },
      });
      const runIds = runs.map((r) => r.id);
      if (runIds.length > 0) {
        await tx.mintRunItem.deleteMany({ where: { runId: { in: runIds } } });
        await tx.mintRun.deleteMany({ where: { id: { in: runIds } } });
      }

      // Items where this wallet was a receiver
      await tx.mintRunItem.deleteMany({ where: { receiverWalletId: id } });

      // Sniper rules using this operator
      const rules = await tx.sniperRule.findMany({
        where: { operatorWalletId: id },
        select: { id: true },
      });
      const ruleIds = rules.map((r) => r.id);
      if (ruleIds.length > 0) {
        await tx.sniperMatch.deleteMany({ where: { ruleId: { in: ruleIds } } });
        await tx.sniperRuleReceiver.deleteMany({ where: { ruleId: { in: ruleIds } } });
        await tx.sniperRule.deleteMany({ where: { id: { in: ruleIds } } });
      }

      await tx.campaign.updateMany({
        where: { scheduleOperatorWalletId: id },
        data: { scheduleOperatorWalletId: null },
      });

      await tx.campaignReceiver.deleteMany({ where: { walletId: id } });
      await tx.sniperRuleReceiver.deleteMany({ where: { walletId: id } });

      await tx.wallet.delete({ where: { id } });
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: ACTIVITY_EVENT_TYPES.WALLET_REMOVED,
        message: `Removed wallet "${existing.label}"`,
        metadata: { address: existing.address, chainId: existing.chainId },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[DELETE /api/wallets/[id]]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete wallet",
      },
      { status: 500 }
    );
  }
}