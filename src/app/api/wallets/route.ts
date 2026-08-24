import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { createWalletSchema, walletRoleSchema } from "@/lib/validations";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const chainIdParam = searchParams.get("chainId");
    const roleParam = searchParams.get("role");

    const role = roleParam ? walletRoleSchema.parse(roleParam) : undefined;
    const chainId = chainIdParam ? Number(chainIdParam) : undefined;

    const wallets = await prisma.wallet.findMany({
      where: {
        userId,
        ...(chainId ? { chainId } : {}),
        ...(role ? { role } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ wallets });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/wallets]", error);
    return NextResponse.json({ error: "Failed to load wallets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const input = createWalletSchema.parse(body);

    const wallet = await prisma.wallet.create({
      data: {
        userId,
        chainId: input.chainId,
        address: input.address,
        label: input.label,
        role: input.role,
      },
    });

    await prisma.activityEvent.create({
      data: {
        userId,
        type: ACTIVITY_EVENT_TYPES.WALLET_ADDED,
        message: `Added ${input.role === "OPERATOR" ? "Operator" : "Receiver"} wallet "${input.label}"`,
        metadata: { walletId: wallet.id, address: wallet.address, chainId: wallet.chainId },
      },
    });

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "This address is already registered on this chain." }, { status: 409 });
    }
    console.error("[POST /api/wallets]", error);
    return NextResponse.json({ error: "Failed to create wallet" }, { status: 500 });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
