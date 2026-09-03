import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { updateSniperRuleSchema } from "@/lib/validations";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = updateSniperRuleSchema.parse(await req.json());

    const existing = await prisma.sniperRule.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    const rule = await prisma.sniperRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.maxPriceWei !== undefined ? { maxPriceWei: input.maxPriceWei } : {}),
        ...(input.maxGasPriceWei !== undefined ? { maxGasPriceWei: input.maxGasPriceWei } : {}),
        ...(input.quantityPerWallet !== undefined ? { quantityPerWallet: input.quantityPerWallet } : {}),
        ...(input.config !== undefined ? { config: input.config as unknown as Prisma.InputJsonValue } : {}),
      },
      include: { operator: true, receivers: { include: { wallet: true } } },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[PATCH /api/sniper/rules/[id]]", error);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await prisma.sniperRule.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    await prisma.sniperRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[DELETE /api/sniper/rules/[id]]", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
