import type { Abi, Address, Hex } from "viem";
import { prisma } from "@/lib/prisma";
import { getHotClients } from "@/lib/server/hotOperator";
import { findAbiFunction, buildCallArgs, computeMintValue } from "@/lib/contracts/abi";
import { extractRevertReason } from "@/lib/contracts/errors";
import { ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { runAllCapChecks } from "@/lib/automation/caps";

export async function executeCampaignOnServer(opts: {
  campaignId: string;
  userId: string;
  operatorWalletId: string;
  maxFeePerGasWei?: string | null;
  maxPriorityFeePerGasWei?: string | null;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: opts.campaignId, userId: opts.userId },
    include: { receivers: { include: { wallet: true } } },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (!campaign.recipientParam) {
    throw new Error("Server execute requires a recipientParam (operator-pays path)");
  }

  const operator = await prisma.wallet.findFirst({
    where: {
      id: opts.operatorWalletId,
      userId: opts.userId,
      role: "OPERATOR",
    },
  });
  if (!operator) throw new Error("Operator wallet not found");

  const { account, walletClient, publicClient, operatorAddress } = getHotClients(
    campaign.chainId
  );
  if (operatorAddress.toLowerCase() !== operator.address.toLowerCase()) {
    throw new Error(
      `OPERATOR_PRIVATE_KEY (${operatorAddress}) != registered operator (${operator.address})`
    );
  }

  const abi = campaign.abi as unknown as Abi;
  const fn = findAbiFunction(abi, campaign.mintFunctionName);
  if (!fn) throw new Error(`Function ${campaign.mintFunctionName} not in ABI`);

  const staticArgs = (campaign.staticArgValues ?? {}) as Record<string, unknown>;
  const priceWei = BigInt(campaign.priceWeiPerMint || "0");
  const estimated =
    priceWei * BigInt(Math.max(campaign.receivers.length, 1));

  const caps = await runAllCapChecks(opts.userId, estimated);
  if (!caps.allowed) throw new Error(caps.reason ?? "Blocked by automation caps");

  const run = await prisma.mintRun.create({
    data: {
      campaignId: campaign.id,
      operatorWalletId: operator.id,
      userId: opts.userId,
      status: "RUNNING",
      maxFeePerGasWei: opts.maxFeePerGasWei ?? null,
      maxPriorityFeePerGasWei: opts.maxPriorityFeePerGasWei ?? null,
      estimatedTotalCostWei: estimated.toString(),
      startedAt: new Date(),
      items: {
        create: campaign.receivers.map((r) => ({
          receiverWalletId: r.walletId,
          status: "PENDING",
        })),
      },
    },
    include: { items: { include: { receiver: true } } },
  });

  let nextNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  for (const item of run.items) {
    const nonce = nextNonce++;
    try {
      const args = buildCallArgs(
        fn,
        campaign.recipientParam,
        item.receiver.address as Address,
        staticArgs
      );
      const hash = await walletClient.writeContract({
        address: campaign.contractAddress as Address,
        abi,
        functionName: campaign.mintFunctionName,
        args,
        account,
        chain: walletClient.chain!,
        value:
          fn.stateMutability === "payable"
            ? computeMintValue(fn, staticArgs, priceWei)
            : undefined,
        nonce,
        ...(opts.maxFeePerGasWei
          ? { maxFeePerGas: BigInt(opts.maxFeePerGasWei) }
          : {}),
        ...(opts.maxPriorityFeePerGasWei
          ? { maxPriorityFeePerGas: BigInt(opts.maxPriorityFeePerGasWei) }
          : {}),
      });

      await prisma.mintRunItem.update({
        where: { id: item.id },
        data: { status: "SUBMITTED", txHash: hash },
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: hash as Hex,
      });
      await prisma.mintRunItem.update({
        where: { id: item.id },
        data: {
          status: receipt.status === "success" ? "CONFIRMED" : "FAILED",
          gasUsedWei: receipt.gasUsed?.toString(),
          effectiveGasPriceWei: receipt.effectiveGasPrice?.toString(),
          errorMessage:
            receipt.status === "success"
              ? null
              : "Transaction mined but reverted",
        },
      });
    } catch (e) {
      await prisma.mintRunItem.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          errorMessage: extractRevertReason(e),
        },
      });
    }
  }

  const items = await prisma.mintRunItem.findMany({ where: { runId: run.id } });
  const ok = items.filter((i) => i.status === "CONFIRMED").length;
  const bad = items.filter((i) => i.status === "FAILED").length;
  const status = bad === 0 ? "COMPLETED" : ok === 0 ? "FAILED" : "PARTIAL";

  await prisma.mintRun.update({
    where: { id: run.id },
    data: { status, completedAt: new Date() },
  });

  await prisma.activityEvent.create({
    data: {
      userId: opts.userId,
      type: ACTIVITY_EVENT_TYPES.RUN_COMPLETED,
      message: `Server run ${status}: ${ok} ok, ${bad} failed`,
      metadata: { runId: run.id, campaignId: campaign.id },
    },
  });

  return { runId: run.id, status };
}