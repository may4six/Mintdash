"use client";

import { useState } from "react";
import { toast } from "sonner";
import { parseEther, parseUnits } from "viem";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, FormField } from "@/components/ui/form-elements";
import { useOperatorWallets, useReceiverWallets } from "@/hooks/useReceiverWallets";
import { createSniperRuleSchema } from "@/lib/validations";
import { shortenAddress } from "@/lib/utils";

export function NftRuleDialog({ chainId, onCreated }: { chainId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: operatorWallets } = useOperatorWallets(chainId);
  const { data: receiverWallets } = useReceiverWallets(chainId);

  const [name, setName] = useState("");
  const [maxPriceEth, setMaxPriceEth] = useState("0.05");
  const [maxGasGwei, setMaxGasGwei] = useState("");
  const [quantityPerWallet, setQuantityPerWallet] = useState(1);
  const [operatorWalletId, setOperatorWalletId] = useState("");
  const [selectedReceiverIds, setSelectedReceiverIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    try {
      const payload = createSniperRuleSchema.parse({
        type: "NFT",
        chainId,
        name,
        maxPriceWei: parseEther(maxPriceEth || "0").toString(),
        maxGasPriceWei: maxGasGwei ? parseUnits(maxGasGwei, 9).toString() : undefined,
        quantityPerWallet,
        operatorWalletId,
        receiverWalletIds: selectedReceiverIds,
        config: {},
      });
      const res = await fetch("/api/sniper/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create rule");
      toast.success(`Created "${name}" — remember to enable it, and turn automation on above.`);
      setOpen(false);
      setName("");
      setSelectedReceiverIds([]);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New rule
        </Button>
      </DialogTrigger>
      <DialogContent
        title="New NFT sniper rule"
        description="Watches for new SeaDrop-style drops matching these filters. Created off — enable it and turn automation on to start watching."
      >
        <div className="space-y-3">
          <FormField label="Rule name">
            <Input placeholder="e.g. Cheap ETH drops" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Max price (ETH)">
              <Input inputMode="decimal" value={maxPriceEth} onChange={(e) => setMaxPriceEth(e.target.value)} />
            </FormField>
            <FormField label="Max gas price (gwei, optional)">
              <Input inputMode="decimal" value={maxGasGwei} onChange={(e) => setMaxGasGwei(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Quantity per wallet">
            <Input
              type="number"
              min={1}
              max={50}
              value={quantityPerWallet}
              onChange={(e) => setQuantityPerWallet(Number(e.target.value) || 1)}
            />
          </FormField>
          <FormField label="Operator wallet">
            <Select value={operatorWalletId} onChange={(e) => setOperatorWalletId(e.target.value)}>
              <option value="">Select an Operator…</option>
              {operatorWallets?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label} — {shortenAddress(w.address)}
                </option>
              ))}
            </Select>
          </FormField>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Receivers</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {(receiverWallets ?? []).map((w) => (
                <label key={w.id} className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary/50">
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
                <p className="p-2 text-xs text-muted-foreground">No Receiver wallets on this chain yet.</p>
              )}
            </div>
          </div>
          <Button
            className="w-full"
            isLoading={busy}
            disabled={!name || !operatorWalletId || selectedReceiverIds.length === 0}
            onClick={handleCreate}
          >
            Create rule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
