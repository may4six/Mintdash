import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { createSniperRuleSchema, sniperTypeSchema } from "@/lib/validations";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type");
    const chainIdParam = searchParams.get("chainId");
    const type = typeParam ? sniperTypeSchema.parse(typeParam) : undefined;
    const chainId = chainIdParam ? Number(chainIdParam) : undefined;

    const rules = await prisma.sniperRule.findMany({
      where: { userId, ...(type ? { type } : {}), ...(chainId ? { chainId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        operator: true,
        receivers: { include: { wallet: true } },
        _count: { select: { matches: true } },
      },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/sniper/rules]", error);
    return NextResponse.json({ error: "Failed to load sniper rules" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const input = createSniperRuleSchema.parse(await req.json());

    const operator = await prisma.wallet.findFirst({
      where: { id: input.operatorWalletId, userId, role: "OPERATOR", chainId: input.chainId },
    });
    if (!operator) return NextResponse.json({ error: "Operator wallet not found on this chain" }, { status: 400 });

    const receiverCount = await prisma.wallet.count({
      where: { id: { in: input.receiverWalletIds }, userId, role: "RECEIVER", chainId: input.chainId },
    });
    if (receiverCount !== input.receiverWalletIds.length) {
      return NextResponse.json({ error: "One or more receiver wallets are invalid for this chain." }, { status: 400 });
    }

    const rule = await prisma.sniperRule.create({
      data: {
        userId,
        type: input.type,
        chainId: input.chainId,
        name: input.name,
        maxPriceWei: input.maxPriceWei,
        maxGasPriceWei: input.maxGasPriceWei,
        quantityPerWallet: input.quantityPerWallet,
        operatorWalletId: input.operatorWalletId,
        config: input.config as unknown as Prisma.InputJsonValue,
        // enabled starts false regardless of the request — arming a rule is
        // a deliberate, separate action from creating it.
        enabled: false,
        receivers: { create: input.receiverWalletIds.map((walletId) => ({ walletId })) },
      },
      include: { operator: true, receivers: { include: { wallet: true } } },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: ACTIVITY_EVENT_TYPES.SNIPER_RULE_CREATED,
        message: `Created ${input.type} sniper rule "${rule.name}" (off — arm it from the sniper page)`,
        metadata: { ruleId: rule.id, chainId: rule.chainId },
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/sniper/rules]", error);
    return NextResponse.json({ error: "Failed to create sniper rule" }, { status: 500 });
  }
}
