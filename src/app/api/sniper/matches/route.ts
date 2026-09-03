import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { matchStatusSchema } from "@/lib/validations";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const recordMatchSchema = z.object({
  ruleId: z.string().min(1),
  contractAddress: z.string().min(1),
  chainId: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("ruleId") ?? undefined;
    const statusParam = searchParams.get("status");
    const status = statusParam ? matchStatusSchema.parse(statusParam) : undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);

    const matches = await prisma.sniperMatch.findMany({
      where: { userId, ...(ruleId ? { ruleId } : {}), ...(status ? { status } : {}) },
      orderBy: { detectedAt: "desc" },
      take: limit,
      include: { rule: true },
    });

    return NextResponse.json({ matches });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid status filter" }, { status: 400 });
    }
    console.error("[GET /api/sniper/matches]", error);
    return NextResponse.json({ error: "Failed to load matches" }, { status: 500 });
  }
}

/**
 * Records a detected opportunity. This is the ONLY thing the detection loop
 * is allowed to do on its own — write an OBSERVED row. Nothing here signs
 * or spends, regardless of the rule's mode or the automation kill switch,
 * which is exactly what makes Shadow mode safe to leave running.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const input = recordMatchSchema.parse(await req.json());

    const rule = await prisma.sniperRule.findFirst({ where: { id: input.ruleId, userId } });
    if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    // Avoid duplicate rows if the polling loop re-scans the same block range.
    const existing = await prisma.sniperMatch.findFirst({
      where: { ruleId: input.ruleId, contractAddress: input.contractAddress },
    });
    if (existing) return NextResponse.json({ match: existing });

    const match = await prisma.sniperMatch.create({
      data: {
        ruleId: input.ruleId,
        userId,
        contractAddress: input.contractAddress,
        chainId: input.chainId,
        status: "OBSERVED",
        metadata: (input.metadata as unknown as Prisma.InputJsonValue) ?? undefined,
      },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: ACTIVITY_EVENT_TYPES.SNIPER_MATCH_OBSERVED,
        message: `[${rule.name}] matched ${input.contractAddress.slice(0, 10)}… — awaiting your confirm`,
        metadata: { ruleId: rule.id, matchId: match.id },
      },
    });

    return NextResponse.json({ match }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/sniper/matches]", error);
    return NextResponse.json({ error: "Failed to record match" }, { status: 500 });
  }
}
