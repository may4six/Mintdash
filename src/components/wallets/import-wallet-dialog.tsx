"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, FormField } from "@/components/ui/form-elements";
import { createWalletSchema } from "@/lib/validations";
import { useInvalidateWallets } from "@/hooks/useReceiverWallets";
import { SUPPORTED_CHAINS } from "@/lib/constants";
import type { WalletRole } from "@/types";

export function ImportWalletDialog({ chainId, defaultRole }: { chainId: number; defaultRole?: WalletRole }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<WalletRole>(defaultRole ?? "RECEIVER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidateWallets = useInvalidateWallets();

  async function handleSubmit() {
    setError(null);
    const parsed = createWalletSchema.safeParse({ address, label, role, chainId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add wallet");
      toast.success(`Added ${parsed.data.label}`);
      invalidateWallets(chainId);
      setAddress("");
      setLabel("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add wallet");
    } finally {
      setBusy(false);
    }
  }

  const chainLabel = SUPPORTED_CHAINS.find((c) => c.id === chainId)?.label ?? `Chain ${chainId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add wallet
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a wallet"
        description={`Register a public address on ${chainLabel}. No private key required — only the Operator needs a signer, and that's configured separately.`}
      >
        <div className="space-y-3">
          <FormField label="Address">
            <Input placeholder="0x..." value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <FormField label="Label">
            <Input placeholder="e.g. Treasury, Alt #3" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>
          <FormField label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as WalletRole)}>
              <option value="RECEIVER">Receiver — holds the minted NFTs</option>
              <option value="OPERATOR">Operator — pays gas + mint price</option>
            </Select>
          </FormField>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full" isLoading={busy} onClick={handleSubmit}>
            Add wallet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
