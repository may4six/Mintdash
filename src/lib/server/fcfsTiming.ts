import type { PublicClient } from "viem";

/** Sleep helper */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tight wall-clock wait until target Date.
 * Coarse sleep until the last ~250ms, then ~8–10ms spins.
 */
export async function waitUntilWallClock(target: Date, opts?: { maxEarlyMs?: number }) {
  const targetMs = target.getTime();
  const maxEarly = opts?.maxEarlyMs ?? 180_000; // 3 minutes

  for (;;) {
    const now = Date.now();
    if (now >= targetMs) return;
    const remaining = targetMs - now;

    if (remaining > maxEarly) {
      throw new Error(
        `FCFS wait started too early (${Math.round(remaining / 1000)}s). Cron should claim closer to T.`
      );
    }

    if (remaining > 250) {
      // Stay responsive but don't burn CPU for minutes
      await sleep(Math.min(remaining - 200, 50));
    } else {
      // Final window: ~8–10ms resolution
      await sleep(8);
    }
  }
}

/**
 * Wait until on-chain time >= targetUnix (SeaDrop startTime).
 * Use after wall-clock wait so we don't spam RPC for minutes.
 */
export async function waitUntilChainTime(
  publicClient: PublicClient,
  targetUnix: bigint,
  opts?: { maxWaitMs?: number }
) {
  const deadline = Date.now() + (opts?.maxWaitMs ?? 30_000);

  for (;;) {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.timestamp >= targetUnix) return;

    if (Date.now() > deadline) {
      throw new Error(
        `Chain time still behind startTime (chain=${block.timestamp}, need=${targetUnix})`
      );
    }

    const lag = Number(targetUnix - block.timestamp);
    // If more than ~2s of chain lag, poll a bit slower
    await sleep(lag > 2 ? 40 : 10);
  }
}