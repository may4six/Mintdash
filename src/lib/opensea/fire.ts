import type { Address, Hex, WalletClient, PublicClient } from "viem";
import {
  buildDropMintTransaction,
  pollForMintCalldata,
  type OpenSeaMintResponse,
} from "./drops";

export interface FireOptions {
  slug: string;
  minter: Address;          // the allowlisted wallet (proof is for this address)
  quantity?: number;
  /** When true, keep polling until the stage opens or timeout */
  waitForStage?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  onAttempt?: (attempt: number, error?: string) => void;
}

export interface FireResult {
  txHash: Hex;
  target: Address;
  value: bigint;
  calldata: Hex;
}

/**
 * One-shot or polling fire for an OpenSea SeaDrop allowlist/public stage.
 * Returns the transaction hash after successful broadcast.
 */
export async function fireSeaDropMint(
  walletClient: WalletClient,
  publicClient: PublicClient,
  options: FireOptions,
): Promise<FireResult> {
  const quantity = options.quantity ?? 1;

  let mintTx: OpenSeaMintResponse;

  if (options.waitForStage) {
    mintTx = await pollForMintCalldata(
      options.slug,
      options.minter,
      quantity,
      {
        intervalMs: options.intervalMs,
        timeoutMs: options.timeoutMs,
        onAttempt: options.onAttempt,
      },
    );
  } else {
    mintTx = await buildDropMintTransaction(options.slug, {
      minter: options.minter,
      quantity,
    });
  }

  const value = BigInt(mintTx.value);

  // Basic balance check
  const account = walletClient.account;
  if (!account) {
    throw new Error("WalletClient has no account");
  }

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < value) {
    throw new Error(
      `Insufficient balance. Need at least ${mintTx.value} wei, have ${balance.toString()}`,
    );
  }

  const hash = await walletClient.sendTransaction({
    account,
    to: mintTx.target,
    data: mintTx.calldata,
    value,
    chain: walletClient.chain,
  });

  return {
    txHash: hash,
    target: mintTx.target,
    value,
    calldata: mintTx.calldata,
  };
}