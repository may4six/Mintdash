import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, AuthError } from "@/lib/auth";
import { automationSettingsSchema } from "@/lib/validations";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { z } from "zod";

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await prisma.automationSettings.findUnique({ where: { userId } });
    // No row yet means automation has never been touched — report the same
    // safe defaults the schema would create, without writing anything yet.
    return NextResponse.json({
      settings: settings ?? {
        userId,
        automationEnabled: false,
        maxSpendPerDayWei: null,
        maxGasPriceWei: null,
        maxConcurrentRuns: 1,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[GET /api/automation/settings]", error);
    return NextResponse.json({ error: "Failed to load automation settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const input = automationSettingsSchema.parse(await req.json());

    const existing = await prisma.automationSettings.findUnique({ where: { userId } });

    const settings = await prisma.automationSettings.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });

    if (!existing || existing.automationEnabled !== input.automationEnabled) {
      await prisma.activityEvent.create({
        data: {
          userId,
          type: ACTIVITY_EVENT_TYPES.AUTOMATION_TOGGLED,
          message: input.automationEnabled
            ? "Automation turned ON — armed rules can now surface confirmable matches"
            : "Automation turned OFF — all sniper/copy monitoring paused",
          metadata: { automationEnabled: input.automationEnabled },
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[PATCH /api/automation/settings]", error);
    return NextResponse.json({ error: "Failed to update automation settings" }, { status: 500 });
  }
}
