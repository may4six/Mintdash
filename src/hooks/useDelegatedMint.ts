"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Abi, Address, WalletClient } from "viem";
import { findAbiFunction, buildCallArgs } from "@/lib/contracts/abi";
import { extractRevertReason } from "@/lib/contracts/errors";
import type { MintExecutionItem } from "@/types";

export interface DelegatedMintParams {
  chainId: number;
  contractAddress: Address;
  abi: Abi;
  functionName: string;
  /** Non-null — this hook is for the operator-pays-for-everyone path only.
   * Callers must route msg.sender-only functions to the receiver self-sign flow instead. */
  recipientParam: string;
  staticArgs: Record<string, unknown>;
  priceWeiPerMint: bigint;
  maxFeePerGasWei?: bigint;
  maxPriorityFeePerGasWei?: bigint;
}

export interface ReceiverTarget {
  walletId: string;
  address: Address;
}

interface UseDelegatedMintResult {
  items: MintExecutionItem[];
  isRunning: boolean;
  execute: (getWalletClient: () => Promise<WalletClient>, receivers: ReceiverTarget[]) => Promise<void>;
  retryFailed: (getWalletClient: () => Promise<WalletClient>) => Promise<void>;
  reset: () => void;
}

export function useDelegatedMint(params: DelegatedMintParams): UseDelegatedMintResult {
  const publicClient = usePublicClient({ chainId: params.chainId });
  const [items, setItems] = useState<MintExecutionItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const targetsRef = useRef<Map<string, ReceiverTarget>>(new Map());

  const fn = useMemo(() => findAbiFunction(params.abi, params.functionName), [params.abi, params.functionName]);

  const updateItem = useCallback((walletId: string, patch: Partial<MintExecutionItem>) => {
    setItems((prev) => prev.map((item) => (item.walletId === walletId ? { ...item, ...patch } : item)));
  }, []);

  const runBatch = useCallback(
    async (
      receivers: ReceiverTarget[],
      walletClient: WalletClient,
      attemptOf: (walletId: string) => number
    ) => {
      if (!publicClient) throw new Error("No RPC client available for this chain yet.");
      if (!fn) throw new Error(`Function "${params.functionName}" not found in the campaign ABI.`);

      const operatorAccount = walletClient.account;
      if (!operatorAccount) throw new Error("Connected/unlocked signer has no account.");
      const operatorChain = walletClient.chain;
      if (!operatorChain) throw new Error("Signer has no chain configured.");

      let nextNonce = await publicClient.getTransactionCount({
        address: operatorAccount.address,
        blockTag: "pending",
      });

      await Promise.all(
        receivers.map(async (receiver) => {
          const nonce = nextNonce;
          nextNonce += 1;
          const attempt = attemptOf(receiver.walletId);

          updateItem(receiver.walletId, { status: "PENDING", errorMessage: undefined, attempt });
          try {
            const args = buildCallArgs(fn, params.recipientParam, receiver.address, params.staticArgs);
            const hash = await walletClient.writeContract({
              address: params.contractAddress,
              abi: params.abi,
              functionName: params.functionName,
              args,
              account: operatorAccount,
              chain: operatorChain,
              value: fn.stateMutability === "payable" ? params.priceWeiPerMint : undefined,
              nonce,
              maxFeePerGas: params.maxFeePerGasWei,
              maxPriorityFeePerGas: params.maxPriorityFeePerGasWei,
            });

            updateItem(receiver.walletId, { status: "SUBMITTED", txHash: hash });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status === "success") {
              updateItem(receiver.walletId, {
                status: "CONFIRMED",
                gasUsedWei: receipt.gasUsed.toString(),
                effectiveGasPriceWei: receipt.effectiveGasPrice?.toString(),
              });
            } else {
              updateItem(receiver.walletId, {
                status: "FAILED",
                errorMessage: "Transaction was mined but reverted on-chain.",
              });
            }
          } catch (error) {
            updateItem(receiver.walletId, {
              status: "FAILED",
              errorMessage: extractRevertReason(error),
            });
          }
        })
      );
    },
    [publicClient, fn, params, updateItem]
  );

  const execute = useCallback(
    async (getWalletClient: () => Promise<WalletClient>, receivers: ReceiverTarget[]) => {
      targetsRef.current = new Map(receivers.map((r) => [r.walletId, r]));
      setItems(
        receivers.map((r) => ({
          walletId: r.walletId,
          address: r.address,
          status: "PENDING",
          attempt: 1,
        }))
      );
      setIsRunning(true);
      try {
        const walletClient = await getWalletClient();
        await runBatch(receivers, walletClient, () => 1);
      } finally {
        setIsRunning(false);
      }
    },
    [runBatch]
  );

  const retryFailed = useCallback(
    async (getWalletClient: () => Promise<WalletClient>) => {
      const failed = items.filter((i) => i.status === "FAILED");
      if (failed.length === 0) return;
      const receivers = failed
        .map((i) => targetsRef.current.get(i.walletId))
        .filter((r): r is ReceiverTarget => !!r);
      const attemptByWallet = new Map(failed.map((i) => [i.walletId, i.attempt + 1]));

      setIsRunning(true);
      try {
        const walletClient = await getWalletClient();
        await runBatch(receivers, walletClient, (walletId) => attemptByWallet.get(walletId) ?? 1);
      } finally {
        setIsRunning(false);
      }
    },
    [items, runBatch]
  );

  const reset = useCallback(() => {
    setItems([]);
    targetsRef.current = new Map();
  }, []);

  return { items, isRunning, execute, retryFailed, reset };
}
