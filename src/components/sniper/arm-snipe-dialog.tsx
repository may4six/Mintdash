"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crosshair } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, FormField } from "@/components/ui/form-elements";
import { CANONICAL_SEADROP_ADDRESS } from "@/lib/sniper/seadrop";
import {
  SEADROP_MINT_PUBLIC_ABI,
  SEADROP_RECIPIENT_PARAM,
  SEADROP_ZERO_FEE_RECIPIENT,
} from "@/lib/sniper/seadropMintPublic";
import { shortenAddress, formatWeiToEth } from "@/lib/utils";
import { createCampaignSchema } from "@/lib/validations";
import type { SniperMatchDTO } from "@/types";

export function ArmSnipeDialog({ match }: { match: SniperMatchDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feeRecipient, setFeeRecipient] = useState(SEADROP_ZERO_FEE_RECIPIENT);
  const [busy, setBusy] = useState(false);

  const rule = match.rule;
  const mintPriceWei = String(match.metadata?.mintPriceWei ?? rule?.maxPriceWei ?? "0");
  const quantity = rule?.quantityPerWallet ?? 1;

  async function handleConfirm() {
    if (!rule) return;
    setBusy(true);
    try {
      const receiverWalletIds = (rule.receivers ?? []).map((r) => r.walletId);
      const payload = createCampaignSchema.parse({
        name: `Snipe: ${shortenAddress(match.contractAddress)}`,
        chainId: match.chainId,
        contractAddress: CANONICAL_SEADROP_ADDRESS,
        abi: SEADROP_MINT_PUBLIC_ABI,
        mintFunctionName: "mintPublic",
        recipientParam: SEADROP_RECIPIENT_PARAM,
        staticArgValues: {
          nftContract: match.contractAddress,
          feeRecipient,
          quantity: String(quantity),
        },
        phase: "PUBLIC",
        priceWeiPerMint: mintPriceWei,
        maxPerWallet: null,
        receiverWalletIds,
      });

      const campaignRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const campaignData = await campaignRes.json();
      if (!campaignRes.ok) throw new Error(campaignData.error ?? "Failed to create campaign for this snipe");

      await fetch(`/api/sniper/matches/${match.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARMED" }),
      });

      toast.success("Campaign ready — continue below to preflight and execute.");
      router.push(`/dashboard/campaigns/${campaignData.campaign.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to arm this snipe");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" /> Snipe
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Arm this snipe"
        description="This creates a campaign from the match — nothing is spent here. Preflight and execute happen on the next screen, same as any manual campaign."
      >
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs">
            <p className="font-mono text-muted-foreground">{shortenAddress(match.contractAddress)}</p>
            <p className="mt-1 text-muted-foreground">
              Detected price: {formatWeiToEth(mintPriceWei)} ETH · Quantity: {quantity}
            </p>
          </div>
          <FormField
            label="Fee recipient"
            hint="SeaDrop drops usually require a specific fee recipient address — check the collection's own mint page for it. Leaving this as the zero address will likely revert."
          >
            <Input value={feeRecipient} onChange={(e) => setFeeRecipient(e.target.value)} />
          </FormField>
          <Button className="w-full" isLoading={busy} onClick={handleConfirm}>
            Create campaign &amp; continue to preflight
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
