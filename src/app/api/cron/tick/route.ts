import { executeSeaDropFireOnServer } from "@/lib/server/executeSeaDropFire";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeCampaignOnServer } from "@/lib/server/executeCampaignRun";
import { executeSelfMintRun } from "@/lib/server/executeSelfMintRun";
import { createCampaignFromSniperMatch } from "@/lib/server/createCampaignFromMatch";
import { hasReceiverKey } from "@/lib/server/receiverKeys";

function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Railway: run every 1 minute (or more often if your plan allows).
 *
 * Claim ARMED campaigns up to 120s BEFORE scheduledAt so the process can
 * pre-build txs and tight-wait to T. Do NOT set this to 10–15s — with a
 * 60s cron that is often too late for FCFS.
 *
 * ScheduleStatus enum (from prisma): NONE | ARMED | FIRED | CANCELLED | FAILED
 * There is no COMPLETED — success leaves the job as FIRED.
 */
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const claimHorizon = new Date(now.getTime() + 120_000); // 2 minutes early
  const results: unknown[] = [];

  // ── Normal scheduled campaigns (NOT SeaDrop fire jobs) ──────────────
  const due = await prisma.campaign.findMany({
    where: {
      autoExecute: true,
      scheduleStatus: "ARMED",
      scheduledAt: { lte: claimHorizon },
      NOT: { mintFunctionName: "seadrop_fire" },
    },
    include: {
      receivers: { include: { wallet: true } },
    },
    take: 10,
  });

  for (const c of due) {
    const claimed = await prisma.campaign.updateMany({
      where: { id: c.id, scheduleStatus: "ARMED" },
      data: { scheduleStatus: "FIRED" },
    });
    if (claimed.count === 0) {
      results.push({
        type: "schedule",
        campaignId: c.id,
        skipped: "already claimed",
      });
      continue;
    }

    try {
      const receivers = c.receivers.map((r) => r.wallet);
      const allHaveKeys =
        receivers.length > 0 &&
        receivers.every((w) => hasReceiverKey(w.address));

      if (allHaveKeys) {
        const out = await executeSelfMintRun({
          campaignId: c.id,
          userId: c.userId,
          bookkeepingWalletId: c.receivers[0]!.walletId,
          maxFeePerGasWei: c.scheduleMaxFeePerGasWei,
          maxPriorityFeePerGasWei: c.scheduleMaxPriorityFeePerGasWei,
          fireAt: c.scheduledAt,
          syncChainStartTime: true,
        });
        results.push({
          type: "schedule",
          mode: "SELF_MINT",
          campaignId: c.id,
          ...out,
        });
      } else if (c.scheduleOperatorWalletId) {
        const out = await executeCampaignOnServer({
          campaignId: c.id,
          userId: c.userId,
          operatorWalletId: c.scheduleOperatorWalletId,
          maxFeePerGasWei: c.scheduleMaxFeePerGasWei,
          maxPriorityFeePerGasWei: c.scheduleMaxPriorityFeePerGasWei,
        });
        results.push({
          type: "schedule",
          mode: "OPERATOR",
          campaignId: c.id,
          ...out,
        });
      } else {
        await prisma.campaign.update({
          where: { id: c.id },
          data: { scheduleStatus: "FAILED" },
        });
        results.push({
          type: "schedule",
          campaignId: c.id,
          error: "Missing RECEIVER_PRIVATE_KEYS for all receivers",
        });
      }
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

  // ── SeaDrop scheduled fires (unattended, OPERATOR_PRIVATE_KEY) ──────
  // Claim up to 90s early so we can pre-poll OpenSea before the stage opens.
  const seaDropHorizon = new Date(now.getTime() + 90_000);
  const seaDropDue = await prisma.campaign.findMany({
    where: {
      autoExecute: true,
      scheduleStatus: "ARMED",
      mintFunctionName: "seadrop_fire",
      scheduledAt: { lte: seaDropHorizon },
    },
    take: 10,
  });

  for (const c of seaDropDue) {
    const args = (c.staticArgValues ?? {}) as {
      slug?: string;
      minter?: string;
      quantity?: number;
      prePollSeconds?: number;
    };

    if (!args.slug || !args.minter) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { scheduleStatus: "FAILED" },
      });
      results.push({
        type: "seadrop",
        campaignId: c.id,
        error: "missing slug/minter",
      });
      continue;
    }

    const scheduledAtMs = c.scheduledAt
      ? new Date(c.scheduledAt).getTime()
      : Date.now();
    const prePollMs = (args.prePollSeconds ?? 45) * 1000;
    const startPollingAt = scheduledAtMs - prePollMs;

    // Too early — leave ARMED for next tick
    if (Date.now() < startPollingAt) {
      results.push({
        type: "seadrop",
        campaignId: c.id,
        status: "waiting",
        startsPollingInMs: startPollingAt - Date.now(),
      });
      continue;
    }

    // Claim so only one cron worker runs it
    const claimed = await prisma.campaign.updateMany({
      where: { id: c.id, scheduleStatus: "ARMED" },
      data: { scheduleStatus: "FIRED" },
    });
    if (claimed.count === 0) {
      results.push({
        type: "seadrop",
        campaignId: c.id,
        skipped: "already claimed",
      });
      continue;
    }

    try {
      const result = await executeSeaDropFireOnServer({
        slug: args.slug,
        minter: args.minter as `0x${string}`,
        quantity: args.quantity ?? 1,
        chainId: c.chainId,
        intervalMs: 350,
        timeoutMs: 180_000,
      });

      // Success: already FIRED from claim — enum has no COMPLETED
      results.push({
        type: "seadrop",
        campaignId: c.id,
        txHash: result.txHash,
        attempts: result.attempts,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.campaign
        .update({
          where: { id: c.id },
          data: { scheduleStatus: "FAILED" },
        })
        .catch(() => undefined);
      results.push({
        type: "seadrop",
        campaignId: c.id,
        error: message,
      });
    }
  }

  // ── Auto-snipe ──────────────────────────────────────────────────────
  const autoMatches = await prisma.sniperMatch.findMany({
    where: {
      status: "OBSERVED",
      rule: { autoExecute: true, enabled: true },
    },
    include: {
      rule: {
        include: {
          receivers: { include: { wallet: true } },
        },
      },
    },
    take: 5,
  });

  for (const m of autoMatches) {
    try {
      const claimed = await prisma.sniperMatch.updateMany({
        where: { id: m.id, status: "OBSERVED" },
        data: { status: "ARMED" },
      });
      if (claimed.count === 0) continue;

      const { campaign, operatorWalletId } = await createCampaignFromSniperMatch(
        m as never,
      );
      const receivers = m.rule.receivers.map((r) => r.wallet);
      const allHaveKeys =
        receivers.length > 0 &&
        receivers.every((w) => hasReceiverKey(w.address));

      if (allHaveKeys && campaign.receivers?.[0]) {
        const out = await executeSelfMintRun({
          campaignId: campaign.id,
          userId: m.userId,
          bookkeepingWalletId: campaign.receivers[0].walletId,
          fireAt: null,
          syncChainStartTime: true,
        });
        await prisma.sniperMatch.update({
          where: { id: m.id },
          data: { status: "EXECUTED" },
        });
        results.push({
          type: "auto-snipe",
          mode: "SELF_MINT",
          matchId: m.id,
          ...out,
        });
      } else {
        const out = await executeCampaignOnServer({
          campaignId: campaign.id,
          userId: m.userId,
          operatorWalletId,
        });
        await prisma.sniperMatch.update({
          where: { id: m.id },
          data: { status: "EXECUTED" },
        });
        results.push({
          type: "auto-snipe",
          mode: "OPERATOR",
          matchId: m.id,
          ...out,
        });
      }
    } catch (e) {
      await prisma.sniperMatch
        .update({ where: { id: m.id }, data: { status: "SKIPPED" } })
        .catch(() => undefined);
      results.push({
        type: "auto-snipe",
        matchId: m.id,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), results });
}