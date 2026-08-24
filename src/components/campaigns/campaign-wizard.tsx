"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther, parseUnits, type Abi, type Address } from "viem";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { toast } from "sonner";
import {
  ShieldCheck,
  Wand2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, FormField } from "@/components/ui/form-elements";
import { EmptyState } from "@/components/ui/misc";
import { FlowBanner } from "@/components/mint/flow-banner";
import { GasSettings } from "@/components/mint/gas-settings";
import { PreflightPanel } from "@/components/mint/preflight-panel";
import { ExecutionProgress } from "@/components/mint/execution-progress";
import { useOperatorWallets, useReceiverWallets } from "@/hooks/useReceiverWallets";
import { useOperatorSigner } from "@/hooks/useOperatorSigner";
import { usePreflight } from "@/hooks/usePreflight";
import { useDelegatedMint } from "@/hooks/useDelegatedMint";
import {
  getLikelyMintFunctions,
  findAbiFunction,
  findRecipientParamName,
  coerceArgValue,
  requiresReceiverSignature,
} from "@/lib/contracts/abi";
import { abiJsonSchema, createCampaignSchema } from "@/lib/validations";
import { explorerTxUrl } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import type { MintPhase, MintExecutionItem, ItemStatus } from "@/types";

const STEPS = ["Contract", "Function & price", "Receivers", "Preflight", "Execute"] as const;

export function CampaignWizard({ chainId }: { chainId: number }) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1 — contract & ABI
  const [name, setName] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [abiText, setAbiText] = useState("");
  const [abiError, setAbiError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const parsedAbi = useMemo<Abi | null>(() => {
    if (!abiText.trim()) return null;
    try {
      const json: unknown = JSON.parse(abiText);
      const result = abiJsonSchema.safeParse(json);
      if (!result.success) return null;
      return json as Abi;
    } catch {
      return null;
    }
  }, [abiText]);

  async function handleDetectAbi() {
    setAbiError(null);
    setIsDetecting(true);
    try {
      const res = await fetch("/api/contracts/abi-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, address: contractAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Detection failed");
      setAbiText(JSON.stringify(data.abi, null, 2));
      toast.success("ABI detected from Etherscan.");
    } catch (err) {
      setAbiError(err instanceof Error ? err.message : "Detection failed — paste the ABI manually.");
    } finally {
      setIsDetecting(false);
    }
  }

  // Step 2 — function, phase, price, static args
  const functionCandidates = useMemo(() => (parsedAbi ? getLikelyMintFunctions(parsedAbi) : []), [parsedAbi]);
  const [selectedFunctionName, setSelectedFunctionName] = useState<string | null>(null);
  const selectedFn = useMemo(
    () => (parsedAbi && selectedFunctionName ? findAbiFunction(parsedAbi, selectedFunctionName) : undefined),
    [parsedAbi, selectedFunctionName]
  );
  const recipientParam = useMemo(() => (selectedFn ? findRecipientParamName(selectedFn) : null), [selectedFn]);
  const otherInputs = useMemo(
    () => selectedFn?.inputs.filter((i) => i.name !== recipientParam) ?? [],
    [selectedFn, recipientParam]
  );
  const [staticArgValues, setStaticArgValues] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<MintPhase>("PUBLIC");
  const [priceEth, setPriceEth] = useState("0");

  // Step 3 — operator + receivers
  const { data: operatorWallets } = useOperatorWallets(chainId);
  const { data: receiverWallets } = useReceiverWallets(chainId);
  const [operatorWalletId, setOperatorWalletId] = useState<string | null>(null);
  const [selectedReceiverIds, setSelectedReceiverIds] = useState<string[]>([]);
  const operatorWallet = operatorWallets?.find((w) => w.id === operatorWalletId);
  const signer = useOperatorSigner((operatorWallet?.address as Address) ?? null, chainId);

  // Step 4 — preflight + persisted campaign
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const preflight = usePreflight();
  const [maxFeeGwei, setMaxFeeGwei] = useState("");
  const [priorityFeeGwei, setPriorityFeeGwei] = useState("");

  // Step 5 — run + execution
  const [runId, setRunId] = useState<string | null>(null);
  const [itemIdByWallet, setItemIdByWallet] = useState<Record<string, string>>({});
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const needsSelfSign = requiresReceiverSignature(recipientParam);

  const staticArgs = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (!selectedFn) return out;
    for (const input of otherInputs) {
      if (!input.name) continue;
      const raw = staticArgValues[input.name] ?? "";
      try {
        out[input.name] = coerceArgValue(input.type, raw);
      } catch {
        out[input.name] = raw;
      }
    }
    return out;
  }, [selectedFn, otherInputs, staticArgValues]);

  const delegatedMint = useDelegatedMint({
    chainId,
    contractAddress: (contractAddress || "0x0000000000000000000000000000000000000000") as Address,
    abi: parsedAbi ?? [],
    functionName: selectedFunctionName ?? "",
    recipientParam: recipientParam ?? "",
    staticArgs,
    priceWeiPerMint: safeParseEther(priceEth),
    maxFeePerGasWei: maxFeeGwei ? parseUnits(maxFeeGwei, 9) : undefined,
    maxPriorityFeePerGasWei: priorityFeeGwei ? parseUnits(priorityFeeGwei, 9) : undefined,
  });

  // Self-sign path status, keyed by walletId — only used when needsSelfSign.
  const [selfSignItems, setSelfSignItems] = useState<Record<string, MintExecutionItem>>({});

  // Persist status changes back to the run record as they happen.
  const syncedStatusRef = useRef<Record<string, ItemStatus>>({});
  const persistItemStatus = useCallback(
    async (walletId: string, item: MintExecutionItem) => {
      const itemId = itemIdByWallet[walletId];
      if (!runId || !itemId) return;
      if (syncedStatusRef.current[walletId] === item.status) return;
      syncedStatusRef.current[walletId] = item.status;
      try {
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
        });
      } catch {
        // Best-effort — live UI state is still correct even if this write fails.
      }
    },
    [runId, itemIdByWallet]
  );

  useEffect(() => {
    if (needsSelfSign) return;
    delegatedMint.items.forEach((item) => void persistItemStatus(item.walletId, item));
  }, [delegatedMint.items, needsSelfSign, persistItemStatus]);

  useEffect(() => {
    if (!needsSelfSign) return;
    Object.values(selfSignItems).forEach((item) => void persistItemStatus(item.walletId, item));
  }, [selfSignItems, needsSelfSign, persistItemStatus]);

  // Once every item reaches a terminal state, close out the run record.
  const runClosedRef = useRef(false);
  useEffect(() => {
    const items = needsSelfSign ? Object.values(selfSignItems) : delegatedMint.items;
    if (!runId || items.length === 0 || runClosedRef.current) return;
    const allTerminal = items.every((i) => i.status === "CONFIRMED" || i.status === "FAILED");
    if (!allTerminal) return;
    if (needsSelfSign === false && delegatedMint.isRunning) return;
    runClosedRef.current = true;
    const allConfirmed = items.every((i) => i.status === "CONFIRMED");
    const anyConfirmed = items.some((i) => i.status === "CONFIRMED");
    const status = allConfirmed ? "COMPLETED" : anyConfirmed ? "PARTIAL" : "FAILED";
    void fetch(`/api/runs/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, completedAt: new Date().toISOString() }),
    });
  }, [needsSelfSign, selfSignItems, delegatedMint.items, delegatedMint.isRunning, runId]);

  const canProceedStep0 = name.trim().length > 0 && !!parsedAbi && contractAddress.trim().length > 0;
  const canProceedStep1 = !!selectedFunctionName;
  const canProceedStep2 = !!operatorWalletId && selectedReceiverIds.length > 0;

  async function saveCampaignAndAdvance() {
    if (!parsedAbi || !selectedFunctionName) return;
    setIsSaving(true);
    try {
      const payload = {
        name,
        chainId,
        contractAddress,
        abi: parsedAbi as unknown as Record<string, unknown>[],
        mintFunctionName: selectedFunctionName,
        recipientParam,
        phase,
        priceWeiPerMint: safeParseEther(priceEth).toString(),
        maxPerWallet: null,
        receiverWalletIds: selectedReceiverIds,
      };
      const parsed = createCampaignSchema.parse(payload);
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save campaign");
      setCampaignId(data.campaign.id);
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setIsSaving(false);
    }
  }

  async function runPreflightCheck() {
    if (!operatorWallet) return;
    const receivers = selectedReceiverIds
      .map((id) => receiverWallets?.find((w) => w.id === id))
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map((w) => ({ walletId: w.id, address: w.address }));

    preflight.mutate(
      {
        chainId,
        contractAddress: contractAddress as Address,
        abi: parsedAbi as unknown as Record<string, unknown>[],
        mintFunctionName: selectedFunctionName!,
        recipientParam,
        staticArgs,
        phase,
        priceWeiPerMint: safeParseEther(priceEth).toString(),
        operatorAddress: operatorWallet.address,
        receivers,
      },
      {
        onSuccess: (result) => {
          setMaxFeeGwei(formatGweiFromWei(result.suggestedMaxFeePerGasWei));
          setPriorityFeeGwei(formatGweiFromWei(result.suggestedMaxPriorityFeePerGasWei));
        },
      }
    );
  }

  async function startRun() {
    if (!campaignId || !operatorWalletId || !preflight.data) return;
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
          campaignId,
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

      const receivers = readyReceiverIds
        .map((id) => receiverWallets?.find((w) => w.id === id))
        .filter((w): w is NonNullable<typeof w> => !!w)
        .map((w) => ({ walletId: w.id, address: w.address as Address }));

      if (needsSelfSign) {
        setSelfSignItems(
          Object.fromEntries(
            receivers.map((r) => [
              r.walletId,
              { walletId: r.walletId, address: r.address, status: "PENDING" as ItemStatus, attempt: 1 },
            ])
          )
        );
      } else {
        await delegatedMint.execute(signer.getWalletClient, receivers);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setIsCreatingRun(false);
    }
  }

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contract</CardTitle>
            <CardDescription>Point at the NFT contract you want to mint from.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField label="Campaign name">
              <Input
                placeholder="e.g. Gamestock Otters — team allocation"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>
            <FormField label="Contract address">
              <div className="flex gap-2">
                <Input placeholder="0x..." value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} />
                <Button variant="outline" onClick={handleDetectAbi} isLoading={isDetecting} disabled={!contractAddress}>
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /> Detect ABI
                </Button>
              </div>
            </FormField>
            <FormField
              label="ABI"
              hint="Paste a JSON ABI, or use Detect ABI for a verified contract."
              error={abiText && !parsedAbi ? "Couldn't parse this as a valid ABI." : (abiError ?? undefined)}
            >
              <Textarea rows={8} placeholder="[ ... ]" value={abiText} onChange={(e) => setAbiText(e.target.value)} />
            </FormField>
          </CardContent>
        </Card>
      )}

      {step === 1 && parsedAbi && (
        <Card>
          <CardHeader>
            <CardTitle>Function &amp; price</CardTitle>
            <CardDescription>Pick the mint entrypoint and how it&apos;s priced.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField label="Mint function">
              <Select value={selectedFunctionName ?? ""} onChange={(e) => setSelectedFunctionName(e.target.value || null)}>
                <option value="">Select a function…</option>
                {functionCandidates.map((fn) => (
                  <option key={fn.name} value={fn.name}>
                    {fn.name}({fn.inputs.map((i) => i.type).join(", ")})
                  </option>
                ))}
              </Select>
            </FormField>

            {selectedFn && (
              <div
                className={
                  recipientParam
                    ? "rounded-md border border-success/30 bg-success/5 p-3 text-xs text-success"
                    : "rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning"
                }
              >
                {recipientParam
                  ? `Recipient detected: "${recipientParam}" — the Operator can mint directly to each Receiver.`
                  : "No recipient parameter found — this mints to whoever calls it. Each Receiver will need to connect and sign their own mint in the final step."}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Phase">
                <Select value={phase} onChange={(e) => setPhase(e.target.value as MintPhase)}>
                  <option value="PUBLIC">Public</option>
                  <option value="WHITELIST">Whitelist</option>
                </Select>
              </FormField>
              <FormField label="Price per mint (ETH)">
                <Input inputMode="decimal" value={priceEth} onChange={(e) => setPriceEth(e.target.value)} />
              </FormField>
            </div>

            {otherInputs.length > 0 && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-xs font-medium text-foreground">Other arguments</p>
                {otherInputs.map((input, idx) => (
                  <FormField key={input.name || `arg-${idx}`} label={`${input.name} (${input.type})`}>
                    <Input
                      placeholder={input.type.endsWith("[]") ? '["0x..","0x.."]' : input.type}
                      value={staticArgValues[input.name ?? ""] ?? ""}
                      onChange={(e) => setStaticArgValues((prev) => ({ ...prev, [input.name ?? ""]: e.target.value }))}
                    />
                  </FormField>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Operator &amp; receivers</CardTitle>
            <CardDescription>Who pays, and who the NFTs go to.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Operator wallet" hint="Pays gas + mint price for every receiver below.">
              <Select value={operatorWalletId ?? ""} onChange={(e) => setOperatorWalletId(e.target.value || null)}>
                <option value="">Select an Operator…</option>
                {operatorWallets?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} — {shortenAddress(w.address)}
                  </option>
                ))}
              </Select>
            </FormField>

            {(!operatorWallets || operatorWallets.length === 0) && (
              <EmptyState
                icon={ShieldCheck}
                title="No Operator wallet yet"
                description="Add one from the Wallets page before continuing."
              />
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Receivers</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    setSelectedReceiverIds(
                      selectedReceiverIds.length === (receiverWallets?.length ?? 0)
                        ? []
                        : (receiverWallets ?? []).map((w) => w.id)
                    )
                  }
                >
                  {selectedReceiverIds.length === (receiverWallets?.length ?? 0) ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {(receiverWallets ?? []).map((w) => (
                  <label
                    key={w.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary/50"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={selectedReceiverIds.includes(w.id)}
                      onChange={(e) =>
                        setSelectedReceiverIds((prev) => (e.target.checked ? [...prev, w.id] : prev.filter((id) => id !== w.id)))
                      }
                    />
                    <span className="flex-1">{w.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{shortenAddress(w.address)}</span>
                  </label>
                ))}
                {(!receiverWallets || receiverWallets.length === 0) && (
                  <p className="p-2 text-xs text-muted-foreground">No Receiver wallets yet — add some from the Wallets page.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Preflight</CardTitle>
            <CardDescription>Nothing is spent until you execute in the next step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FlowBanner />
            {!preflight.data && (
              <Button onClick={runPreflightCheck} isLoading={preflight.isPending}>
                Run preflight check
              </Button>
            )}
            {preflight.isError && <p className="text-xs text-destructive">{preflight.error.message}</p>}
            {preflight.data && (
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
                <Button variant="outline" size="sm" onClick={runPreflightCheck} isLoading={preflight.isPending}>
                  Re-run preflight
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && operatorWallet && (
        <Card>
          <CardHeader>
            <CardTitle>Execute</CardTitle>
            <CardDescription>
              {needsSelfSign
                ? "Each receiver connects and signs their own mint."
                : `Operator (${operatorWallet.label}) signs for every ready receiver.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!needsSelfSign && !signer.isReady && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                Configure this Operator&apos;s signer from the Wallets page before executing.
              </div>
            )}

            {!runId && (
              <Button onClick={startRun} isLoading={isCreatingRun} disabled={!needsSelfSign && !signer.isReady}>
                Execute mint
              </Button>
            )}

            {runId && !needsSelfSign && (
              <ExecutionProgress
                items={delegatedMint.items}
                chainId={chainId}
                isRunning={delegatedMint.isRunning}
                onRetryFailed={() => void delegatedMint.retryFailed(signer.getWalletClient)}
              />
            )}

            {runId && needsSelfSign && (
              <div className="space-y-2">
                {Object.values(selfSignItems).map((item) => (
                  <SelfSignReceiverRow
                    key={item.walletId}
                    chainId={chainId}
                    contractAddress={contractAddress as Address}
                    abi={parsedAbi as Abi}
                    functionName={selectedFunctionName!}
                    staticArgs={staticArgs}
                    priceWei={safeParseEther(priceEth)}
                    isPayable={selectedFn?.stateMutability === "payable"}
                    item={item}
                    onChange={(next) => setSelfSignItems((prev) => ({ ...prev, [next.walletId]: next }))}
                  />
                ))}
              </div>
            )}

            {campaignId && (
              <Button variant="ghost" size="sm" asChild>
                <a href={`/dashboard/campaigns/${campaignId}`}>View campaign history</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
        </Button>
        {step < 2 && (
          <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}>
            Next <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {step === 2 && (
          <Button onClick={saveCampaignAndAdvance} isLoading={isSaving} disabled={!canProceedStep2}>
            Save &amp; continue <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {step === 3 && (
          <Button onClick={() => setStep(4)} disabled={!preflight.data}>
            Continue to execute <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {step === 4 && campaignId && (
          <Button variant="outline" onClick={() => router.push(`/dashboard/campaigns/${campaignId}`)}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div
            className={
              "flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs " +
              (i === current ? "bg-primary/10 text-primary" : i < current ? "text-success" : "text-muted-foreground")
            }
          >
            {i < current ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Circle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {label}
          </div>
          {i < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
        </div>
      ))}
    </div>
  );
}

/** One row of the msg.sender-only self-sign flow: connect this exact wallet, then mint. */
function SelfSignReceiverRow({
  chainId,
  contractAddress,
  abi,
  functionName,
  staticArgs,
  priceWei,
  isPayable,
  item,
  onChange,
}: {
  chainId: number;
  contractAddress: Address;
  abi: Abi;
  functionName: string;
  staticArgs: Record<string, unknown>;
  priceWei: bigint;
  isPayable: boolean;
  item: MintExecutionItem;
  onChange: (next: MintExecutionItem) => void;
}) {
  const { address: connectedAddress } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient({ chainId });
  const isMatch = connectedAddress?.toLowerCase() === item.address.toLowerCase();

  async function handleMint() {
    if (!publicClient) return;
    onChange({ ...item, status: "PENDING", errorMessage: undefined });
    try {
      const args = Object.values(staticArgs);
      const hash = await writeContractAsync({
        address: contractAddress,
        abi,
        functionName,
        args,
        chainId,
        value: isPayable ? priceWei : undefined,
      });
      onChange({ ...item, status: "SUBMITTED", txHash: hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      onChange({
        ...item,
        status: receipt.status === "success" ? "CONFIRMED" : "FAILED",
        txHash: hash,
        gasUsedWei: receipt.gasUsed.toString(),
        effectiveGasPriceWei: receipt.effectiveGasPrice?.toString(),
        errorMessage: receipt.status === "success" ? undefined : "Reverted on-chain",
      });
    } catch (err) {
      onChange({ ...item, status: "FAILED", errorMessage: err instanceof Error ? err.message : "Mint failed" });
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
      <div>
        <p className="font-mono text-xs">{shortenAddress(item.address)}</p>
        <p className="text-[11px] text-muted-foreground">
          {item.status === "CONFIRMED" && "Confirmed"}
          {item.status === "FAILED" && (item.errorMessage ?? "Failed")}
          {item.status === "SUBMITTED" && "Waiting for confirmation…"}
          {item.status === "PENDING" && (isMatch ? "Ready to mint" : "Connect this wallet in your extension first")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {item.txHash && (
          <a
            href={explorerTxUrl(chainId, item.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        {item.status !== "CONFIRMED" && (
          <Button
            size="sm"
            variant={isMatch ? "default" : "outline"}
            disabled={!isMatch}
            isLoading={isPending || item.status === "SUBMITTED"}
            onClick={handleMint}
          >
            Mint
          </Button>
        )}
      </div>
    </div>
  );
}

function safeParseEther(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  try {
    return parseEther(trimmed);
  } catch {
    return 0n;
  }
}

function formatGweiFromWei(wei: string): string {
  try {
    return (Number(BigInt(wei)) / 1e9).toString();
  } catch {
    return "";
  }
}
