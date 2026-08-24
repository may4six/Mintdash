import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { z } from "zod";

const addReceiversSchema = z.object({
  walletIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id: campaignId } = await params;
    const { walletIds } = addReceiversSchema.parse(await req.json());

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const owned = await prisma.wallet.count({
      where: { id: { in: walletIds }, userId, role: "RECEIVER" },
    });
    if (owned !== walletIds.length) {
      return NextResponse.json({ error: "One or more selected receiver wallets are invalid." }, { status: 400 });
    }

    // skipDuplicates so re-adding an already-attached wallet is a no-op
    // instead of a unique-constraint error.
    await prisma.campaignReceiver.createMany({
      data: walletIds.map((walletId) => ({ campaignId, walletId })),
      skipDuplicates: true,
    });

    const receivers = await prisma.campaignReceiver.findMany({
      where: { campaignId },
      include: { wallet: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ receivers });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/campaigns/[id]/receivers]", error);
    return NextResponse.json({ error: "Failed to add receivers" }, { status: 500 });
  }
}
