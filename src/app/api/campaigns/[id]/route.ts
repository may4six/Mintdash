import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, userId },
      include: {
        receivers: { include: { wallet: true }, orderBy: { createdAt: "asc" } },
        runs: {
          orderBy: { createdAt: "desc" },
          include: {
            operator: true,
            items: { include: { receiver: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    return NextResponse.json({ campaign });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/campaigns/[id]]", error);
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await prisma.campaign.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[DELETE /api/campaigns/[id]]", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
