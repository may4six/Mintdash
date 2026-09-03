import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { createCampaignSchema } from "@/lib/validations";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const chainIdParam = searchParams.get("chainId");
    const chainId = chainIdParam ? Number(chainIdParam) : undefined;

    const campaigns = await prisma.campaign.findMany({
      where: { userId, ...(chainId ? { chainId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { receivers: true, runs: true } },
      },
    });

    return NextResponse.json({ campaigns });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/campaigns]", error);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const input = createCampaignSchema.parse(body);

    // Every receiver wallet ID must actually belong to this user — without
    // this check, a crafted request could attach someone else's wallet row.
    if (input.receiverWalletIds.length > 0) {
      const owned = await prisma.wallet.count({
        where: { id: { in: input.receiverWalletIds }, userId, role: "RECEIVER" },
      });
      if (owned !== input.receiverWalletIds.length) {
        return NextResponse.json({ error: "One or more selected receiver wallets are invalid." }, { status: 400 });
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        chainId: input.chainId,
        name: input.name,
        contractAddress: input.contractAddress,
        abi: input.abi as unknown as Prisma.InputJsonValue,
        mintFunctionName: input.mintFunctionName,
        recipientParam: input.recipientParam,
        staticArgValues: input.staticArgValues as unknown as Prisma.InputJsonValue,
        phase: input.phase,
        priceWeiPerMint: input.priceWeiPerMint,
        maxPerWallet: input.maxPerWallet ?? null,
        receivers: {
          create: input.receiverWalletIds.map((walletId) => ({ walletId })),
        },
      },
      include: { receivers: { include: { wallet: true } } },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: ACTIVITY_EVENT_TYPES.CAMPAIGN_CREATED,
        message: `Created campaign "${campaign.name}"`,
        metadata: { campaignId: campaign.id, chainId: campaign.chainId },
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/campaigns]", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
