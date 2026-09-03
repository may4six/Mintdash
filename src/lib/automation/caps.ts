import { prisma } from "@/lib/prisma";

export interface CapCheckResult {
  allowed: boolean;
  reason: string | null;
}

/**
 * The kill switch: every sniper/copy execution path must call this before
 * doing anything else. automationEnabled defaults to false — a user who has
 * never touched the automation settings page has automation fully off,
 * even if they've created and enabled individual rules.
 */
export async function checkAutomationEnabled(userId: string): Promise<CapCheckResult> {
  const settings = await prisma.automationSettings.findUnique({ where: { userId } });
  if (!settings || !settings.automationEnabled) {
    return { allowed: false, reason: "Automation is off. Turn it on from the safety panel to arm any rule." };
  }
  return { allowed: true, reason: null };
}

/** Concurrent-run cap: counts this user's currently-RUNNING MintRuns. */
export async function checkConcurrentRunCap(userId: string): Promise<CapCheckResult> {
  const settings = await prisma.automationSettings.findUnique({ where: { userId } });
  const limit = settings?.maxConcurrentRuns ?? 1;
  const running = await prisma.mintRun.count({ where: { userId, status: "RUNNING" } });
  if (running >= limit) {
    return { allowed: false, reason: `Concurrent run cap reached (${running}/${limit}).` };
  }
  return { allowed: true, reason: null };
}

/** Daily spend cap: sums estimatedTotalCostWei for runs started in the last 24h. */
export async function checkDailySpendCap(userId: string, additionalWei: bigint): Promise<CapCheckResult> {
  const settings = await prisma.automationSettings.findUnique({ where: { userId } });
  if (!settings?.maxSpendPerDayWei) return { allowed: true, reason: null };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentRuns = await prisma.mintRun.findMany({
    where: { userId, startedAt: { gte: since } },
    select: { estimatedTotalCostWei: true },
  });
  const spentWei = recentRuns.reduce((sum, r) => sum + BigInt(r.estimatedTotalCostWei || "0"), 0n);
  const capWei = BigInt(settings.maxSpendPerDayWei);
  if (spentWei + additionalWei > capWei) {
    return { allowed: false, reason: "Daily spend cap would be exceeded by this run." };
  }
  return { allowed: true, reason: null };
}

/** Runs every cap check in sequence, short-circuiting on the first failure. */
export async function runAllCapChecks(userId: string, additionalSpendWei: bigint): Promise<CapCheckResult> {
  const checks = [
    () => checkAutomationEnabled(userId),
    () => checkConcurrentRunCap(userId),
    () => checkDailySpendCap(userId, additionalSpendWei),
  ];
  for (const check of checks) {
    const result = await check();
    if (!result.allowed) return result;
  }
  return { allowed: true, reason: null };
}
