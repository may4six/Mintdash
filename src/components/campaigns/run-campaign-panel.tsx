"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseUnits, type Address, type Abi } from "viem";
import { toast } from "sonner";
import { PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, FormField } from "@/components/ui/form-elements";
import { GasSettings } from "@/components/mint/gas-settings";
import { PreflightPanel } from "@/components/mint/preflight-panel";
import { ExecutionProgress } from "@/components/mint/execution-progress";
import { useOperatorWallets } from "@/hooks/useReceiverWallets";
import { useOperatorSigner } from "@/hooks/useOperatorSigner";
import { usePreflight } from "@/hooks/usePreflight";
import { useDelegatedMint } from "@/hooks/useDelegatedMint";
import { requiresReceiverSignature } from "@/lib/contracts/abi";
import { shortenAddress } from "@/lib/utils";
import type { CampaignDTO, ItemStatus, MintExecutionItem } from "@/types";

export function RunCampaignPanel({ campaign }: { campaign: CampaignDTO }) {
  const { data: operatorWallets } = useOperatorWallets(campaign.chainId);
  const [operatorWalletId, setOperatorWalletId] = useState<string | null>(null);
  const [selectedReceiverIds, setSelectedReceiverIds] = useState<string[]>(
    (campaign.receivers ?? []).map((r) => r.walletId)
  );
  const operatorWallet = operatorWallets?.find((w) => w.id === operatorWalletId);
  const signer = useOperatorSigner((operatorWallet?.address as Address) ?? null, campaign.chainId);
  const preflight = usePreflight();
  const [maxFeeGwei, setMaxFeeGwei] = useState("");
  const [priorityFeeGwei, setPriorityFeeGwei] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [itemIdByWallet, setItemIdByWallet] = useState<Record<string, string>>({});
  const needsSelfSign = requiresReceiverSignature(campaign.recipientParam);

  const delegatedMint = useDelegatedMint({
    chainId: campaign.chainId,
    contractAddress: campaign.contractAddress as Address,
    abi: campaign.abi as unknown as Abi,
    functionName: campaign.mintFunctionName,
    recipientParam: campaign.recipientParam ?? "",
    staticArgs: campaign.staticArgValues ?? {},
    priceWeiPerMint: BigInt(campaign.priceWeiPerMint || "0"),
    maxFeePerGasWei: maxFeeGwei ? parseUnits(maxFeeGwei, 9) : undefined,
    maxPriorityFeePerGasWei: priorityFeeGwei ? parseUnits(priorityFeeGwei, 9) : undefined,
  });

  const syncedStatusRef = useRef<Record<string, ItemStatus>>({});
  const persistItemStatus = useCallback(
    async (walletId: string, item: MintExecutionItem) => {
      const itemId = itemIdByWallet[walletId];
      if (!runId || !itemId) return;
      if (syncedStatusRef.current[walletId] === item.status) return;
      syncedStatusRef.current[walletId] = item.status;
      await fetch(`/api/runs/${runId}/items`, {
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
    },
    [runId, itemIdByWallet]
  );

  useEffect(() => {
    delegatedMint.items.forEach((item) => void persistItemStatus(item.walletId, item));
  }, [delegatedMint.items, persistItemStatus]);

  const runClosedRef = useRef(false);
  useEffect(() => {
    if (!runId || delegatedMint.items.length === 0 || runClosedRef.current || delegatedMint.isRunning) return;
    const allTerminal = delegatedMint.items.every((i) => i.status === "CONFIRMED" || i.status === "FAILED");
    if (!allTerminal) return;
    runClosedRef.current = true;
    const allConfirmed = delegatedMint.items.every((i) => i.status === "CONFIRMED");
    const anyConfirmed = delegatedMint.items.some((i) => i.status === "CONFIRMED");
    const status = allConfirmed ? "COMPLETED" : anyConfirmed ? "PARTIAL" : "FAILED";
    void fetch(`/api/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, completedAt: new Date().toISOString() }),
    });
  }, [runId, delegatedMint.items, delegatedMint.isRunning]);

  async function runPreflightCheck() {
    if (!operatorWallet) return;
    const receivers = (campaign.receivers ?? [])
      .filter((r) => selectedReceiverIds.includes(r.walletId) && r.wallet)
      .map((r) => ({ walletId: r.walletId, address: r.wallet!.address as Address }));

    preflight.mutate(
      {
        chainId: campaign.chainId,
        contractAddress: campaign.contractAddress as Address,
        abi: campaign.abi as unknown as Record<string, unknown>[],
        mintFunctionName: campaign.mintFunctionName,
        recipientParam: campaign.recipientParam,
        staticArgs: campaign.staticArgValues ?? {},
        phase: campaign.phase,
        priceWeiPerMint: campaign.priceWeiPerMint,
        operatorAddress: operatorWallet.address as Address,
        receivers,
      },
      {
        onSuccess: (result) => {
          setMaxFeeGwei((Number(BigInt(result.suggestedMaxFeePerGasWei)) / 1e9).toString());
          setPriorityFeeGwei((Number(BigInt(result.suggestedMaxPriorityFeePerGasWei)) / 1e9).toString());
        },
      }
    );
  }

  async function startRun() {
    if (!operatorWalletId || !preflight.data) return;
    const readyReceiverIds = preflight.data.receivers.filter((r) => r.ready).map((r) => r.walletId);
    if (readyReceiverIds.length === 0) {
      toast.error("No receivers are ready to mint yet.");
      return;
    }
    setIsCreatingRun(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          operatorWalletId,
          receiverWalletIds: readyReceiverIds,
          maxFeePerGasWei: maxFeeGwei ? parseUnits(maxFeeGwei, 9).toString() : undefined,
          maxPriorityFeePerGasWei: priorityFeeGwei ? parseUnits(priorityFeeGwei, 9).toString() : undefined,
          estimatedTotalCostWei: preflight.data.totalEstimatedCostWei,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start run");

      const mapping: Record<string, string> = {};
      for (const item of data.run.items) mapping[item.receiverWalletId] = item.id;
      setItemIdByWallet(mapping);
      setRunId(data.run.id);
      runClosedRef.current = false;
      syncedStatusRef.current = {};

      if (!needsSelfSign) {
        const receivers = (campaign.receivers ?? [])
          .filter((r) => readyReceiverIds.includes(r.walletId) && r.wallet)
          .map((r) => ({ walletId: r.walletId, address: r.wallet!.address as Address }));
        await delegatedMint.execute(signer.getWalletClient, receivers);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setIsCreatingRun(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayCircle className="h-4 w-4" aria-hidden="true" /> Start a new run
        </CardTitle>
        <CardDescription>Reuses this campaign&apos;s saved contract, function, and phase.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsSelfSign && (
          <p className="text-xs text-warning">
            This function has no recipient parameter — receivers must connect and sign their own mint. Use the New
            Campaign wizard for the guided self-sign flow.
          </p>
        )}
        <FormField label="Operator wallet">
          <Select value={operatorWalletId ?? ""} onChange={(e) => setOperatorWalletId(e.target.value || null)}>
            <option value="">Select an Operator…</option>
            {operatorWallets?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label} — {shortenAddress(w.address)}
              </option>
            ))}
          </Select>
        </FormField>

        {!preflight.data && (
          <Button
            onClick={runPreflightCheck}
            isLoading={preflight.isPending}
            disabled={!operatorWalletId || selectedReceiverIds.length === 0}
          >
            Run preflight check
          </Button>
        )}
        {preflight.isError && <p className="text-xs text-destructive">{preflight.error.message}</p>}
        {preflight.data && !runId && (
          <>
            <PreflightPanel result={preflight.data} />
            <GasSettings
              suggestedMaxFeeWei={preflight.data.suggestedMaxFeePerGasWei}
              suggestedPriorityFeeWei={preflight.data.suggestedMaxPriorityFeePerGasWei}
              maxFeeGwei={maxFeeGwei}
              priorityFeeGwei={priorityFeeGwei}
              onChange={({ maxFeeGwei: mf, priorityFeeGwei: pf }) => {
                setMaxFeeGwei(mf);
                setPriorityFeeGwei(pf);
              }}
            />
            {!needsSelfSign && !signer.isReady && (
              <p className="text-xs text-warning">Configure this Operator&apos;s signer from the Wallets page first.</p>
            )}
            <Button onClick={startRun} isLoading={isCreatingRun} disabled={!needsSelfSign && !signer.isReady}>
              Execute mint
            </Button>
          </>
        )}
        {runId && !needsSelfSign && (
          <ExecutionProgress
            items={delegatedMint.items}
            chainId={campaign.chainId}
            isRunning={delegatedMint.isRunning}
            onRetryFailed={() => void delegatedMint.retryFailed(signer.getWalletClient)}
          />
        )}
      </CardContent>
    </Card>
  );
}
