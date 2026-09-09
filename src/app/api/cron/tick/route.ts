import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCampaignOnServer } from "@/lib/server/executeCampaignRun";
import { createCampaignFromSniperMatch } from "@/lib/server/createCampaignFromMatch";

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
  const results: unknown[] = [];

  // ── Scheduled campaigns ──────────────────────────────────────────────
  const due = await prisma.campaign.findMany({
    where: {
      autoExecute: true,
      scheduleStatus: "ARMED",
      scheduledAt: { lte: now },
    },
    take: 20,
  });

  for (const c of due) {
    try {
      if (!c.scheduleOperatorWalletId) {
        await prisma.campaign.update({
          where: { id: c.id },
          data: { scheduleStatus: "FAILED" },
        });
        results.push({ type: "schedule", campaignId: c.id, error: "No scheduleOperatorWalletId" });
        continue;
      }

      // Caps are enforced inside executeCampaignOnServer
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
      results.push({ type: "schedule", campaignId: c.id, ...out });
    } catch (e) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { scheduleStatus: "FAILED" },
      });
      results.push({
        type: "schedule",
        campaignId: c.id,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  }

  // ── Auto-snipe (server / laptop closed) ──────────────────────────────
  const autoMatches = await prisma.sniperMatch.findMany({
    where: {
      status: "OBSERVED",
      rule: { autoExecute: true, enabled: true },
    },
    include: {
      rule: {
        include: {
          receivers: true,
        },
      },
    },
    take: 10,
  });

  for (const m of autoMatches) {
    try {
      const settings = await prisma.automationSettings.findUnique({
        where: { userId: m.userId },
      });
      if (!settings?.automationEnabled) continue;

      const meta = m.metadata as { feeRecipient?: string } | null;
      if (
        !meta?.feeRecipient ||
        meta.feeRecipient === "0x0000000000000000000000000000000000000000"
      ) {
        await prisma.sniperMatch.update({
          where: { id: m.id },
          data: {
            status: "SKIPPED",
            skipReason: "No resolved feeRecipient in match metadata",
          },
        });
        results.push({ type: "snipe", matchId: m.id, error: "missing feeRecipient" });
        continue;
      }

      if (!m.rule.receivers.length) {
        await prisma.sniperMatch.update({
          where: { id: m.id },
          data: {
            status: "SKIPPED",
            skipReason: "Rule has no receiver wallets",
          },
        });
        results.push({ type: "snipe", matchId: m.id, error: "no receivers" });
        continue;
      }

      await prisma.sniperMatch.update({
        where: { id: m.id },
        data: { status: "ARMED", armedAt: new Date() },
      });

      const { campaign, operatorWalletId } = await createCampaignFromSniperMatch(m);

      const out = await executeCampaignOnServer({
        campaignId: campaign.id,
        userId: m.userId,
        operatorWalletId,
        maxFeePerGasWei: m.rule.maxGasPriceWei ?? undefined,
      });

      await prisma.sniperMatch.update({
        where: { id: m.id },
        data: {
          status: "EXECUTED",
          executedRunId: out.runId,
        },
      });

      results.push({
        type: "snipe",
        matchId: m.id,
        campaignId: campaign.id,
        ...out,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "auto-snipe failed";
      await prisma.sniperMatch.update({
        where: { id: m.id },
        data: {
          status: "SKIPPED",
          skipReason: message.slice(0, 280),
        },
      });
      results.push({ type: "snipe", matchId: m.id, error: message });
    }
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), results });
}

export const GET = POST;