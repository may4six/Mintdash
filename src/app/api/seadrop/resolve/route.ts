import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { requireUserId, AuthError } from "@/lib/auth";
import { getChainMeta, getRpcUrl } from "@/lib/constants";
import { CANONICAL_SEADROP_ADDRESS, SEADROP_READ_ABI } from "@/lib/sniper/seadrop";
import { resolveSeaDropFeeRecipient } from "@/lib/sniper/feeRecipient";

/**
 * POST { chainId, nftContract }
 * Returns public drop terms + resolved feeRecipient for SeaDrop mintPublic.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    const body = await req.json();
    const chainId = Number(body.chainId);
    const nftContract = String(body.nftContract ?? "").trim() as Address;

    if (!Number.isFinite(chainId) || !/^0x[0-9a-fA-F]{40}$/.test(nftContract)) {
      return NextResponse.json(
        { error: "chainId and nftContract (0x…) are required" },
        { status: 400 }
      );
    }

    const meta = getChainMeta(chainId);
    const client = createPublicClient({
      chain: meta.chain,
      transport: http(getRpcUrl(chainId)),
    });

    const drop = await client.readContract({
      address: CANONICAL_SEADROP_ADDRESS,
      abi: SEADROP_READ_ABI,
      functionName: "getPublicDrop",
      args: [nftContract],
    });

    const fee = await resolveSeaDropFeeRecipient(
      client,
      nftContract,
      drop.restrictFeeRecipients
    );

    return NextResponse.json({
      seaDropAddress: CANONICAL_SEADROP_ADDRESS,
      nftContract,
      publicDrop: {
        mintPriceWei: drop.mintPrice.toString(),
        startTime: Number(drop.startTime),
        endTime: Number(drop.endTime),
        maxTotalMintableByWallet: Number(drop.maxTotalMintableByWallet),
        feeBps: Number(drop.feeBps),
        restrictFeeRecipients: drop.restrictFeeRecipients,
      },
      feeRecipient: fee.address,
      feeRecipientSource: fee.source,
      feeRecipientReason: fee.address === null ? fee.reason : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[POST /api/seadrop/resolve]", error);
    const message = error instanceof Error ? error.message : "Failed to resolve SeaDrop drop";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}