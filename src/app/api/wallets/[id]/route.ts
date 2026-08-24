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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await prisma.wallet.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    await prisma.wallet.delete({ where: { id } });

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
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[DELETE /api/wallets/[id]]", error);
    return NextResponse.json({ error: "Failed to delete wallet" }, { status: 500 });
  }
}
