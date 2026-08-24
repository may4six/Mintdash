import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { z } from "zod";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";

const updateRunSchema = z.object({
  status: z.enum(["RUNNING", "COMPLETED", "FAILED", "PARTIAL"]).optional(),
  completedAt: z.string().datetime().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const run = await prisma.mintRun.findFirst({
      where: { id, userId },
      include: {
        campaign: true,
        operator: true,
        items: { include: { receiver: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/runs/[id]]", error);
    return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const input = updateRunSchema.parse(await req.json());

    const existing = await prisma.mintRun.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const run = await prisma.mintRun.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.completedAt ? { completedAt: new Date(input.completedAt) } : {}),
      },
    });

    if (input.status && ["COMPLETED", "FAILED", "PARTIAL"].includes(input.status)) {
      await prisma.activityEvent.create({
        data: {
          userId,
          type: ACTIVITY_EVENT_TYPES.RUN_COMPLETED,
          message: `Run finished with status ${input.status}`,
          metadata: { runId: run.id },
        },
      });
    }

    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[PATCH /api/runs/[id]]", error);
    return NextResponse.json({ error: "Failed to update run" }, { status: 500 });
  }
}
