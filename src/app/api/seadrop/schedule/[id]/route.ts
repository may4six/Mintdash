import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const job = await prisma.campaign.findFirst({
    where: {
      id,
      userId,
      mintFunctionName: "seadrop_fire",
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Only cancel jobs that haven't been claimed yet
  if (job.scheduleStatus !== "ARMED") {
    return NextResponse.json(
      {
        error: `Cannot cancel job in status ${job.scheduleStatus}. Only ARMED jobs can be cancelled.`,
      },
      { status: 400 },
    );
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      scheduleStatus: "CANCELLED",
      autoExecute: false,
    },
  });

  return NextResponse.json({
    id: updated.id,
    scheduleStatus: updated.scheduleStatus,
  });
}