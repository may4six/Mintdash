"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crosshair, CheckCircle2, AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import {
  CANONICAL_SEADROP_ADDRESS,
} from "@/lib/sniper/seadrop";

import {
  SEADROP_MINT_PUBLIC_ABI,
  SEADROP_RECIPIENT_PARAM,
} from "@/lib/sniper/seadropMintPublic";

import {
  shortenAddress,
  formatWeiToEth,
} from "@/lib/utils";

import { createCampaignSchema } from "@/lib/validations";

import type { SniperMatchDTO } from "@/types";

export function ArmSnipeDialog({
  match,
}: {
  match: SniperMatchDTO;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rule = match.rule;

  const mintPriceWei = String(
    match.metadata?.mintPriceWei ??
      rule?.maxPriceWei ??
      "0",
  );

  const quantity =
    rule?.quantityPerWallet ?? 1;

  const feeRecipient =
    match.metadata?.feeRecipient ?? null;

  const feeRecipientSource =
    match.metadata?.feeRecipientSource ?? null;

  const canArm =
    !!rule &&
    !!feeRecipient;

  async function handleConfirm() {
    if (!rule) return;

    if (!feeRecipient) {
      toast.error(
        "SeaDrop fee recipient could not be resolved safely.",
      );
      return;
    }

    setBusy(true);

    try {
      const receiverWalletIds =
        (rule.receivers ?? []).map(
          (r) => r.walletId,
        );

      const payload =
        createCampaignSchema.parse({
          name: `Snipe: ${shortenAddress(
            match.contractAddress,
          )}`,

          chainId: match.chainId,

          contractAddress:
            CANONICAL_SEADROP_ADDRESS,

          abi: SEADROP_MINT_PUBLIC_ABI,

          mintFunctionName: "mintPublic",

          recipientParam:
            SEADROP_RECIPIENT_PARAM,

          staticArgValues: {
            nftContract:
              match.contractAddress,

            feeRecipient,

            quantity: String(quantity),
          },

          phase: "PUBLIC",

          priceWeiPerMint: mintPriceWei,

          maxPerWallet: null,

          receiverWalletIds,
        });

      const campaignRes = await fetch(
        "/api/campaigns",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const campaignData =
        await campaignRes.json();

      if (!campaignRes.ok) {
        throw new Error(
          campaignData.error ??
            "Failed to create campaign",
        );
      }

      await fetch(
        `/api/sniper/matches/${match.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "ARMED",
          }),
        },
      );

      toast.success(
        "Snipe armed — fee recipient resolved automatically.",
      );

      router.push(
        `/dashboard/campaigns/${campaignData.campaign.id}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to arm this snipe",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={!canArm}
        >
          <Crosshair
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />

          {canArm ? "Snipe" : "Fee unresolved"}
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Arm this snipe"
        description="MintDash resolved the SeaDrop fee recipient from on-chain configuration."
      >
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs">
            <p className="font-mono text-muted-foreground">
              {shortenAddress(
                match.contractAddress,
              )}
            </p>

            <p className="mt-1 text-muted-foreground">
              Price:{" "}
              {formatWeiToEth(
                mintPriceWei,
              )}{" "}
              ETH · Quantity: {quantity}
            </p>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />

              <span className="text-sm font-medium">
                Fee recipient resolved
              </span>
            </div>

            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {feeRecipient}
            </p>

            <p className="mt-1 text-[11px] text-muted-foreground">
              Source:{" "}
              {feeRecipientSource ??
                "on-chain resolution"}
            </p>
          </div>

          {!feeRecipient && (
            <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />

              SeaDrop did not expose a safe fee
              recipient. MintDash will not guess.
            </div>
          )}

          <Button
            className="w-full"
            isLoading={busy}
            disabled={!canArm}
            onClick={handleConfirm}
          >
            Create campaign & continue to preflight
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}