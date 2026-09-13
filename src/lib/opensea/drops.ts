/**
 * OpenSea Drops API client
 * Used for SeaDrop allowlist / FCFS / public stages that require
 * a live Merkle proof (mintParams + proof).
 *
 * Docs: https://docs.opensea.io/docs/mint-from-a-drop
 */

export interface OpenSeaMintRequest {
  minter: `0x${string}`;
  quantity: number;
}

export interface OpenSeaMintResponse {
  target: `0x${string}`;
  calldata: `0x${string}`;
  value: string; // wei as decimal string
}

export interface OpenSeaDropStage {
  uuid: string;
  stage_type: string;
  label: string;
  price: string;
  start_time: string | null;
  end_time: string | null;
  max_per_wallet: number | null;
}

export interface OpenSeaDropDetails {
  collection_slug: string;
  collection_name: string;
  contract_address: `0x${string}`;
  chain: string;
  is_minting: boolean;
  max_supply: string;
  total_supply: string;
  stages: OpenSeaDropStage[];
  active_stage?: OpenSeaDropStage | null;
  next_stage?: OpenSeaDropStage | null;
}

function getApiKey(): string {
  const key =
    process.env.OPENSEA_API_KEY ||
    process.env.NEXT_PUBLIC_OPENSEA_API_KEY;

  if (!key) {
    throw new Error(
      "OPENSEA_API_KEY is not set. Add it to .env (see .env.example).",
    );
  }
  return key;
}

/**
 * Fetch full drop details (stages, supply, active/next stage).
 */
export async function getDrop(slug: string): Promise<OpenSeaDropDetails> {
  const res = await fetch(`https://api.opensea.io/api/v2/drops/${slug}`, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": getApiKey(),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenSea getDrop failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Build ready-to-sign mint transaction for a specific wallet.
 * This is the ONLY reliable way to get a valid Merkle proof
 * for SeaDrop allowlist stages.
 */
export async function buildDropMintTransaction(
  slug: string,
  request: OpenSeaMintRequest,
): Promise<OpenSeaMintResponse> {
  const res = await fetch(
    `https://api.opensea.io/api/v2/drops/${slug}/mint`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": getApiKey(),
      },
      body: JSON.stringify({
        minter: request.minter,
        quantity: request.quantity,
      }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text();
    // Common statuses:
    // 409 – stage not active yet
    // 422 – not on allowlist / limit exceeded / sold out
    throw new Error(`OpenSea mint build failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Poll until the stage is live and returns valid calldata,
 * or until timeout.
 */
export async function pollForMintCalldata(
  slug: string,
  minter: `0x${string}`,
  quantity: number,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onAttempt?: (attempt: number, error?: string) => void;
  } = {},
): Promise<OpenSeaMintResponse> {
  const interval = options.intervalMs ?? 300;
  const timeout = options.timeoutMs ?? 120_000;
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < timeout) {
    attempt += 1;
    try {
      const tx = await buildDropMintTransaction(slug, { minter, quantity });
      options.onAttempt?.(attempt);
      return tx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      options.onAttempt?.(attempt, msg);

      // Hard failures that should stop polling early
      if (
        msg.includes("422") ||
        msg.includes("not in allowlist") ||
        msg.includes("sold out") ||
        msg.includes("limit exceeded")
      ) {
        throw err;
      }
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(
    `Timed out after ${timeout}ms waiting for OpenSea mint calldata (slug=${slug})`,
  );
}