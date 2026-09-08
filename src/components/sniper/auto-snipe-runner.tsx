"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { toast } from "sonner";
import { useAutomationSettings } from "@/hooks/useAutomationSettings";
import { usePreflight } from "@/hooks/usePreflight";
import { useDelegatedMint } from "@/hooks/useDelegatedMint";
import { useOperatorSigner } from "@/hooks/useOperatorSigner";
import { CANONICAL_SEADROP_ADDRESS } from "@/lib/sniper/seadrop";
import {
  SEADROP_MINT_PUBLIC_ABI,
  SEADROP_RECIPIENT_PARAM,
} from "@/lib/sniper/seadropMintPublic";
import type { ItemStatus, MintExecutionItem, SniperMatchDTO } from "@/types";

type ReceiverRow = { walletId: string; address: Address };

export function AutoSnipeRunner({
  match,
  onChanged,
}: {
  match: SniperMatchDTO;
  onChanged: () => void;
}) {
  const rule = match.rule;
  const { settings } = useAutomationSettings();
  const preflight = usePreflight();

  const [runId, setRunId] = useState<string | null>(null);
  const [itemIdByWallet, setItemIdByWallet] = useState<Record<string, string>>({});
  const startedRef = useRef(false);
  const syncedStatusRef = useRef<Record<string, ItemStatus>>({});

  const feeRecipientRaw = match.metadata?.feeRecipient;
  const feeRecipient =
    typeof feeRecipientRaw === "string" && isAddress(feeRecipientRaw)
      ? (feeRecipientRaw as Address)
      : null;

  const priceWei = BigInt(
    String(match.metadata?.mintPriceWei ?? rule?.maxPriceWei ?? "0")
  );
  const quantity = rule?.quantityPerWallet ?? 1;

  const operatorAddress =
    rule?.operator?.address && isAddress(rule.operator.address)
      ? (rule.operator.address as Address)
      : null;

  const receivers = useMemo((): ReceiverRow[] => {
    return (rule?.receivers ?? [])
      .map((r) => {
        const address = r.wallet?.address;
        if (!address || !isAddress(address)) return null;
        return { walletId: r.walletId, address: address as Address };
      })
      .filter((r): r is ReceiverRow => r !== null);
  }, [rule?.receivers]);

  const staticArgs = useMemo(
    () => ({
      nftContract: match.contractAddress,
      feeRecipient: feeRecipient ?? "0x0000000000000000000000000000000000000000",
      quantity: String(quantity),
    }),
    [match.contractAddress, feeRecipient, quantity]
  );

  const mint = useDelegatedMint({
    chainId: match.chainId,
    contractAddress: CANONICAL_SEADROP_ADDRESS,
    abi: SEADROP_MINT_PUBLIC_ABI,
    functionName: "mintPublic",
    recipientParam: SEADROP_RECIPIENT_PARAM,
    staticArgs,
    priceWeiPerMint: priceWei,
  });

  const signer = useOperatorSigner(operatorAddress, match.chainId);

  // ─── Persist MintRunItem status as the client execution engine updates ───
  useEffect(() => {
    if (!runId) return;

    for (const item of mint.items) {
      if (item.status === "PENDING") continue;

      const itemId = itemIdByWallet[item.walletId];
      if (!itemId) continue;
      if (syncedStatusRef.current[item.walletId] === item.status) continue;

      syncedStatusRef.current[item.walletId] = item.status;

      void fetch(`/api/runs/${runId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          status: item.status,
          txHash: item.txHash,
          errorMessage: item.errorMessage,
          gasUsedWei: item.gasUsedWei,
          effectiveGasPriceWei: item.effectiveGasPriceWei,
          attempt: item.attempt,
        }),
      }).catch(() => undefined);
    }
  }, [mint.items, runId, itemIdByWallet]);

  // ─── Close the run when every item is terminal ───
  const runClosedRef = useRef(false);
  useEffect(() => {
    if (!runId || mint.items.length === 0 || runClosedRef.current || mint.isRunning) return;

    const allTerminal = mint.items.every(
      (i) => i.status === "CONFIRMED" || i.status === "FAILED"
    );
    if (!allTerminal) return;

    runClosedRef.current = true;
    const allConfirmed = mint.items.every((i) => i.status === "CONFIRMED");
    const anyConfirmed = mint.items.some((i) => i.status === "CONFIRMED");
    const status = allConfirmed ? "COMPLETED" : anyConfirmed ? "PARTIAL" : "FAILED";

    void fetch(`/api/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, completedAt: new Date().toISOString() }),
    }).catch(() => undefined);

    void fetch(`/api/sniper/matches/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: anyConfirmed ? "EXECUTED" : "SKIPPED",
        ...(anyConfirmed ? { executedRunId: runId } : { skipReason: `Run ${status}` }),
      }),
    })
      .then(() => onChanged())
      .catch(() => undefined);
  }, [runId, mint.items, mint.isRunning, match.id, onChanged]);

  // ─── One-shot auto pipeline ───
  useEffect(() => {
    if (startedRef.current) return;

    if (
      match.status !== "OBSERVED" ||
      !rule?.autoExecute ||
      !settings?.automationEnabled ||
      !feeRecipient ||
      !operatorAddress ||
      receivers.length === 0 ||
      !signer.isReady ||
      !rule.operatorWalletId
    ) {
      return;
    }

    startedRef.current = true;

    void (async () => {
      async function skip(reason: string) {
        await fetch(`/api/sniper/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "SKIPPED",
            skipReason: reason.slice(0, 280),
          }),
        });
        toast.error(`Auto-snipe skipped: ${reason}`);
        onChanged();
      }

      try {
        // 1. Preflight (same path as manual campaigns)
        const result = await preflight.mutateAsync({
          chainId: match.chainId,
          contractAddress: CANONICAL_SEADROP_ADDRESS,
          abi: SEADROP_MINT_PUBLIC_ABI as unknown as Record<string, unknown>[],
          mintFunctionName: "mintPublic",
          recipientParam: SEADROP_RECIPIENT_PARAM,
          staticArgs,
          phase: "PUBLIC",
          priceWeiPerMint: priceWei.toString(),
          operatorAddress,
          receivers,
        });

        if (!result.allReady) {
          const reason =
            result.receivers.find((r) => !r.ready)?.blockReason ??
            "Preflight rejected this mint.";
          await skip(reason);
          return;
        }

        // 2. Rule gas ceiling
        if (
          rule.maxGasPriceWei &&
          BigInt(result.suggestedMaxFeePerGasWei) > BigInt(rule.maxGasPriceWei)
        ) {
          await skip("Suggested gas price exceeds this rule's maximum.");
          return;
        }

        // 3. Create campaign (same shape as ArmSnipeDialog)
        const campaignRes = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Auto Snipe: ${match.contractAddress.slice(0, 10)}`,
            chainId: match.chainId,
            contractAddress: CANONICAL_SEADROP_ADDRESS,
            abi: SEADROP_MINT_PUBLIC_ABI,
            mintFunctionName: "mintPublic",
            recipientParam: SEADROP_RECIPIENT_PARAM,
            staticArgValues: staticArgs,
            phase: "PUBLIC",
            priceWeiPerMint: priceWei.toString(),
            maxPerWallet: null,
            receiverWalletIds: receivers.map((r) => r.walletId),
          }),
        });
        const campaignData = await campaignRes.json();
        if (!campaignRes.ok) {
          throw new Error(campaignData.error ?? "Failed to create campaign");
        }

        // 4. Mark ARMED before broadcast
        await fetch(`/api/sniper/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ARMED" }),
        });

        // 5. Create MintRun (server caps apply here)
        const runRes = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaignData.campaign.id,
            operatorWalletId: rule.operatorWalletId,
            receiverWalletIds: receivers.map((r) => r.walletId),
            maxFeePerGasWei: result.suggestedMaxFeePerGasWei,
            maxPriorityFeePerGasWei: result.suggestedMaxPriorityFeePerGasWei,
            estimatedTotalCostWei: result.totalEstimatedCostWei,
          }),
        });
        const runData = await runRes.json();
        if (!runRes.ok) {
          throw new Error(runData.error ?? "Automation caps blocked this run.");
        }

        const mapping: Record<string, string> = {};
        for (const item of runData.run.items as {
          id: string;
          receiverWalletId: string;
        }[]) {
          mapping[item.receiverWalletId] = item.id;
        }
        setItemIdByWallet(mapping);
        setRunId(runData.run.id);
        runClosedRef.current = false;
        syncedStatusRef.current = {};

        // 6. Existing client execution engine
        await mint.execute(signer.getWalletClient, receivers);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Automatic snipe failed.";
        await skip(message);
      }
    })();
  }, [
    match.id,
    match.status,
    match.chainId,
    match.contractAddress,
    rule?.autoExecute,
    rule?.operatorWalletId,
    rule?.maxGasPriceWei,
    settings?.automationEnabled,
    feeRecipient,
    operatorAddress,
    receivers,
    signer.isReady,
    signer.getWalletClient,
    priceWei,
    staticArgs,
    preflight,
    mint,
    onChanged,
  ]);

  return null;
}