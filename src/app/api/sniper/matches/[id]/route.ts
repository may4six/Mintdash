import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { updateSniperMatchSchema } from "@/lib/validations";
import { runAllCapChecks } from "@/lib/automation/caps";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = updateSniperMatchSchema.parse(await req.json());

    const existing = await prisma.sniperMatch.findFirst({ where: { id, userId }, include: { rule: true } });
    if (!existing) return NextResponse.json({ error: "Match not found" }, { status: 404 });

    // EXECUTED is the only transition that represents real spending having
    // happened — it must point at a real run, and passes through every cap
    // check one more time server-side (the client already ran preflight,
    // this is the backstop, not a substitute for it).
    if (input.status === "EXECUTED") {
      if (!input.executedRunId) {
        return NextResponse.json({ error: "executedRunId is required to mark a match EXECUTED" }, { status: 400 });
      }
      const run = await prisma.mintRun.findFirst({ where: { id: input.executedRunId, userId } });
      if (!run) return NextResponse.json({ error: "Referenced run not found" }, { status: 400 });

      const capCheck = await runAllCapChecks(userId, BigInt(run.estimatedTotalCostWei || "0"));
      if (!capCheck.allowed) {
        return NextResponse.json({ error: capCheck.reason ?? "Blocked by automation caps" }, { status: 403 });
      }
    }

    const match = await prisma.sniperMatch.update({
      where: { id },
      data: {
        status: input.status,
        skipReason: input.status === "SKIPPED" ? (input.skipReason ?? null) : existing.skipReason,
        executedRunId: input.executedRunId ?? existing.executedRunId,
        armedAt: input.status === "ARMED" ? new Date() : existing.armedAt,
      },
    });

    const eventType =
      input.status === "SKIPPED"
        ? ACTIVITY_EVENT_TYPES.SNIPER_MATCH_SKIPPED
        : input.status === "ARMED"
          ? ACTIVITY_EVENT_TYPES.SNIPER_MATCH_ARMED
          : input.status === "EXECUTED"
            ? ACTIVITY_EVENT_TYPES.SNIPER_SNIPE_EXECUTED
            : null;

    if (eventType) {
      await prisma.activityEvent.create({
        data: {
          userId,
          type: eventType,
          message:
            input.status === "SKIPPED"
              ? `[${existing.rule.name}] match skipped${input.skipReason ? `: ${input.skipReason}` : ""}`
              : input.status === "ARMED"
                ? `[${existing.rule.name}] match armed — confirm to execute`
                : `[${existing.rule.name}] snipe executed on your confirm`,
          metadata: { ruleId: existing.ruleId, matchId: match.id },
        },
      });
    }

    return NextResponse.json({ match });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[PATCH /api/sniper/matches/[id]]", error);
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}
