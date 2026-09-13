import type { Address, Hex } from "viem";
import { getHotClients } from "@/lib/server/hotOperator";
import {
  buildDropMintTransaction,
  pollForMintCalldata,
  type OpenSeaMintResponse,
} from "@/lib/opensea/drops";
import { robinhood } from "@/lib/constants";

export interface SeaDropFireJob {
  slug: string;
  minter: Address;
  quantity?: number;
  chainId?: number;
  /** Poll this many ms before scheduled start (default 45s) */
  prePollMs?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

export interface SeaDropFireResult {
  txHash: Hex;
  target: Address;
  value: bigint;
  calldata: Hex;
  attempts: number;
}

/**
 * Unattended SeaDrop mint.
 * Signs with OPERATOR_PRIVATE_KEY on the server — no browser, no popup.
 */
export async function executeSeaDropFireOnServer(
  job: SeaDropFireJob,
): Promise<SeaDropFireResult> {
  const chainId = job.chainId ?? robinhood.id;
  const quantity = job.quantity ?? 1;
  const intervalMs = job.intervalMs ?? 350;
  const timeoutMs = job.timeoutMs ?? 180_000;

  const { account, walletClient, publicClient, operatorAddress } =
    getHotClients(chainId);

  // Safety: if minter is the operator, fine. If different, still ok —
  // OpenSea proof is for `minter`, gas is paid by operator.
  console.log(
    `[SeaDropFire] operator=${operatorAddress} minter=${job.minter} slug=${job.slug}`,
  );

  let attempts = 0;

  const mintTx: OpenSeaMintResponse = await pollForMintCalldata(
    job.slug,
    job.minter,
    quantity,
    {
      intervalMs,
      timeoutMs,
      onAttempt: (n, err) => {
        attempts = n;
        if (err) {
          console.log(`[SeaDropFire] attempt ${n}: ${err.slice(0, 120)}`);
        } else {
          console.log(`[SeaDropFire] attempt ${n}: got calldata`);
        }
      },
    },
  );

  const value = BigInt(mintTx.value);

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < value) {
    throw new Error(
      `Operator balance too low. need=${mintTx.value} have=${balance.toString()}`,
    );
  }

  const hash = await walletClient.sendTransaction({
    account,
    to: mintTx.target,
    data: mintTx.calldata as Hex,
    value,
    chain: walletClient.chain,
  });

  console.log(`[SeaDropFire] submitted tx=${hash}`);

  return {
    txHash: hash,
    target: mintTx.target,
    value,
    calldata: mintTx.calldata as Hex,
    attempts,
  };
}