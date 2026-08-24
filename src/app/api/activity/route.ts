import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { logActivitySchema } from "@/lib/validations";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 100);

    const events = await prisma.activityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/activity]", error);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const input = logActivitySchema.parse(await req.json());

    const event = await prisma.activityEvent.create({
      data: {
        userId,
        type: input.type,
        message: input.message,
        metadata: (input.metadata as unknown as Prisma.InputJsonValue) ?? undefined,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/activity]", error);
    return NextResponse.json({ error: "Failed to log activity" }, { status: 500 });
  }
}
