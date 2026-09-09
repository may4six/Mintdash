import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { hasReceiverKey } from "@/lib/server/receiverKeys";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";

const armSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  maxFeePerGasWei: z.string().regex(/^\d+$/).optional().nullable(),
  maxPriorityFeePerGasWei: z.string().regex(/^\d+$/).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = armSchema.parse(await req.json());
    const scheduledAt = new Date(body.scheduledAt);

    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
    }
    if (scheduledAt.getTime() < Date.now() - 5_000) {
      return NextResponse.json(
        { error: "scheduledAt is in the past" },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id, userId },
      include: { receivers: { include: { wallet: true } } },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.receivers.length === 0) {
      return NextResponse.json({ error: "Attach receivers first" }, { status: 400 });
    }

    const missing = campaign.receivers
      .map((r) => r.wallet.address)
      .filter((a) => !hasReceiverKey(a));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Missing RECEIVER_PRIVATE_KEYS for: ${missing.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        scheduledAt,
        autoExecute: true,
        scheduleStatus: "ARMED",
        scheduleMaxFeePerGasWei: body.maxFeePerGasWei ?? null,
        scheduleMaxPriorityFeePerGasWei: body.maxPriorityFeePerGasWei ?? null,
        scheduleOperatorWalletId: null,
      },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: ACTIVITY_EVENT_TYPES.RUN_STARTED,
        message: `Armed FCFS self-mint "${campaign.name}" at ${scheduledAt.toISOString()}`,
        metadata: {
          campaignId: campaign.id,
          scheduledAt: scheduledAt.toISOString(),
          mode: "SELF_MINT",
        },
      },
    });

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    console.error("[POST schedule]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to arm" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.scheduleStatus !== "ARMED") {
      return NextResponse.json({ error: "Not ARMED" }, { status: 400 });
    }
    const updated = await prisma.campaign.update({
      where: { id },
      data: { scheduleStatus: "CANCELLED", autoExecute: false },
    });
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
  }
}