import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { createRunSchema } from "@/lib/validations";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") ?? undefined;

    const runs = await prisma.mintRun.findMany({
      where: { userId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        campaign: true,
        operator: true,
        items: { include: { receiver: true } },
      },
    });

    return NextResponse.json({ runs });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/runs]", error);
    return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const input = createRunSchema.parse(await req.json());

    const campaign = await prisma.campaign.findFirst({ where: { id: input.campaignId, userId } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const operator = await prisma.wallet.findFirst({
      where: { id: input.operatorWalletId, userId, role: "OPERATOR" },
    });
    if (!operator) return NextResponse.json({ error: "Operator wallet not found" }, { status: 400 });

    const receiverCount = await prisma.wallet.count({
      where: { id: { in: input.receiverWalletIds }, userId, role: "RECEIVER" },
    });
    if (receiverCount !== input.receiverWalletIds.length) {
      return NextResponse.json({ error: "One or more selected receiver wallets are invalid." }, { status: 400 });
    }

    const run = await prisma.mintRun.create({
      data: {
        campaignId: input.campaignId,
        operatorWalletId: input.operatorWalletId,
        userId,
        status: "RUNNING",
        startedAt: new Date(),
        maxFeePerGasWei: input.maxFeePerGasWei,
        maxPriorityFeePerGasWei: input.maxPriorityFeePerGasWei,
        estimatedTotalCostWei: input.estimatedTotalCostWei,
        items: {
          create: input.receiverWalletIds.map((receiverWalletId) => ({ receiverWalletId })),
        },
      },
      include: { items: { include: { receiver: true } }, operator: true, campaign: true },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: ACTIVITY_EVENT_TYPES.RUN_STARTED,
        message: `Started a run of "${campaign.name}" across ${input.receiverWalletIds.length} wallet(s)`,
        metadata: { runId: run.id, campaignId: campaign.id },
      },
    });

    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/runs]", error);
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }
}
