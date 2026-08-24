import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { updateRunItemSchema } from "@/lib/validations";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: runId } = await params;
    const input = updateRunItemSchema.parse(await req.json());

    const item = await prisma.mintRunItem.findFirst({
      where: { id: input.itemId, runId, run: { userId } },
      include: { receiver: true },
    });
    if (!item) return NextResponse.json({ error: "Run item not found" }, { status: 404 });

    const updated = await prisma.mintRunItem.update({
      where: { id: input.itemId },
      data: {
        status: input.status,
        txHash: input.txHash ?? item.txHash,
        errorMessage: input.status === "FAILED" ? (input.errorMessage ?? item.errorMessage) : null,
        gasUsedWei: input.gasUsedWei ?? item.gasUsedWei,
        effectiveGasPriceWei: input.effectiveGasPriceWei ?? item.effectiveGasPriceWei,
        attempt: input.attempt ?? item.attempt,
      },
    });

    if (input.status === "SUBMITTED" || input.status === "CONFIRMED" || input.status === "FAILED") {
      const type =
        input.status === "SUBMITTED"
          ? ACTIVITY_EVENT_TYPES.ITEM_SUBMITTED
          : input.status === "CONFIRMED"
            ? ACTIVITY_EVENT_TYPES.ITEM_CONFIRMED
            : ACTIVITY_EVENT_TYPES.ITEM_FAILED;
      await prisma.activityEvent.create({
        data: {
          userId,
          type,
          message: `Mint ${input.status.toLowerCase()} for ${item.receiver.label}`,
          metadata: { runId, itemId: item.id, txHash: input.txHash ?? undefined },
        },
      });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[PATCH /api/runs/[id]/items]", error);
    return NextResponse.json({ error: "Failed to update run item" }, { status: 500 });
  }
}
