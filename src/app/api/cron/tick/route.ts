import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCampaignOnServer } from "@/lib/server/executeCampaignRun";

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.campaign.findMany({
    where: {
      autoExecute: true,
      scheduleStatus: "ARMED",
      scheduledAt: { lte: now },
    },
    take: 20,
  });

  const results: unknown[] = [];

  for (const c of due) {
    try {
      if (!c.scheduleOperatorWalletId) {
        await prisma.campaign.update({
          where: { id: c.id },
          data: { scheduleStatus: "FAILED" },
        });
        results.push({ campaignId: c.id, error: "No scheduleOperatorWalletId" });
        continue;
      }

      const out = await executeCampaignOnServer({
        campaignId: c.id,
        userId: c.userId,
        operatorWalletId: c.scheduleOperatorWalletId,
        maxFeePerGasWei: c.scheduleMaxFeePerGasWei,
        maxPriorityFeePerGasWei: c.scheduleMaxPriorityFeePerGasWei,
      });

      await prisma.campaign.update({
        where: { id: c.id },
        data: { scheduleStatus: "FIRED" },
      });
      results.push({ campaignId: c.id, ...out });
    } catch (e) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { scheduleStatus: "FAILED" },
      });
      results.push({
        campaignId: c.id,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  }

  // Auto-snipe: matches already OBSERVED whose rule has autoExecute
  const autoMatches = await prisma.sniperMatch.findMany({
    where: {
      status: "OBSERVED",
      rule: { autoExecute: true, enabled: true },
    },
    include: { rule: { include: { receivers: true } } },
    take: 10,
  });

  for (const m of autoMatches) {
    const settings = await prisma.automationSettings.findUnique({
      where: { userId: m.userId },
    });
    if (!settings?.automationEnabled) continue;

    // Minimal path: mark ARMED and leave campaign creation to your existing
    // "snipe → create campaign" helper if you have one. Prefer calling that
    // shared function here so behavior matches the UI Snipe button.
    await prisma.sniperMatch.update({
      where: { id: m.id },
      data: { status: "ARMED", armedAt: new Date() },
    });
    // TODO: call the same server helper the UI uses after "Snipe" to create
    // campaign + executeCampaignOnServer. Wire that next once you paste
    // the Snipe handler file path.
    results.push({ matchId: m.id, note: "armed-for-auto; wire execute helper" });
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), results });
}

export const GET = POST;