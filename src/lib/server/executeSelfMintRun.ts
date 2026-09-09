import type { Abi, Address, Hex } from "viem";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  zeroAddress,
} from "viem";
import { prisma } from "@/lib/prisma";
import { getChainMeta, getRpcUrl, ACTIVITY_EVENT_TYPES } from "@/lib/constants";
import { findAbiFunction, buildCallArgs, computeMintValue } from "@/lib/contracts/abi";
import { extractRevertReason } from "@/lib/contracts/errors";
import { runAllCapChecks } from "@/lib/automation/caps";
import {
  isAllowListCampaign,
  buildAllowListArgsFromStatic,
  allowListMintValue,
  parseMintParams,
} from "@/lib/sniper/seadropAllowList";
import { getReceiverAccount } from "@/lib/server/receiverKeys";
import { waitUntilWallClock, waitUntilChainTime } from "@/lib/server/fcfsTiming";

const ZERO = zeroAddress;

export async function executeSelfMintRun(opts: {
  campaignId: string;
  userId: string;
  bookkeepingWalletId: string;
  maxFeePerGasWei?: string | null;
  maxPriorityFeePerGasWei?: string | null;
  /** Wall-clock fire time (campaign.scheduledAt) */
  fireAt?: Date | null;
  /**
   * If true (default), after wall clock also wait until chain timestamp
   * reaches SeaDrop startTime from mintParams / optional staticArg.
   */
  syncChainStartTime?: boolean;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: opts.campaignId, userId: opts.userId },
    include: { receivers: { include: { wallet: true } } },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.receivers.length === 0) throw new Error("Campaign has no receivers");

  const meta = getChainMeta(campaign.chainId);
  const rpc = getRpcUrl(campaign.chainId) ?? meta.chain.rpcUrls.default.http[0];
  const publicClient = createPublicClient({
    chain: meta.chain,
    transport: http(rpc),
  });

  const abi = campaign.abi as unknown as Abi;
  const fn = findAbiFunction(abi, campaign.mintFunctionName);
  if (!fn) throw new Error(`Function ${campaign.mintFunctionName} not in ABI`);

  const staticArgs = (campaign.staticArgValues ?? {}) as Record<string, unknown>;
  const priceWei = BigInt(campaign.priceWeiPerMint || "0");
  const allowList = isAllowListCampaign(campaign.mintFunctionName);
  const isSeaDropPublic = campaign.mintFunctionName === "mintPublic";

  const perMint = allowList
    ? allowListMintValue(staticArgs, priceWei)
    : priceWei * BigInt(String(staticArgs.quantity ?? "1") || "1");
  const estimated = perMint * BigInt(campaign.receivers.length);
  const caps = await runAllCapChecks(opts.userId, estimated);
  if (!caps.allowed) throw new Error(caps.reason ?? "Blocked by automation caps");

  // Optional on-chain startTime (allowlist mintParams or static startTime)
  let chainStartUnix: bigint | null = null;
  if (opts.syncChainStartTime !== false) {
    try {
      if (allowList && staticArgs.mintParams) {
        chainStartUnix = parseMintParams(staticArgs.mintParams).startTime;
      } else if (staticArgs.startTime != null) {
        chainStartUnix = BigInt(String(staticArgs.startTime));
      }
    } catch {
      chainStartUnix = null;
    }
  }

  const run = await prisma.mintRun.create({
    data: {
      campaignId: campaign.id,
      operatorWalletId: opts.bookkeepingWalletId,
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

  // ── PREPARE (before T): accounts, nonces, calldata ─────────────────────
  type Prepared = {
    itemId: string;
    address: Address;
    account: ReturnType<typeof getReceiverAccount>;
    to: Address;
    data: Hex;
    value: bigint | undefined;
    nonce: number;
  };

  const prepared: Prepared[] = [];

  for (const item of run.items) {
    const receiverAddress = item.receiver.address as Address;
    const account = getReceiverAccount(receiverAddress);

    let args: unknown[];
    let value: bigint | undefined;

    if (allowList) {
      args = buildAllowListArgsFromStatic(staticArgs, receiverAddress);
      value = allowListMintValue(staticArgs, priceWei);
    } else if (isSeaDropPublic) {
      const nftContract = String(staticArgs.nftContract ?? "") as Address;
      const feeRecipient = String(staticArgs.feeRecipient ?? "") as Address;
      const quantity = BigInt(String(staticArgs.quantity ?? "1"));
      if (!nftContract || !feeRecipient || feeRecipient === ZERO) {
        throw new Error("nftContract and non-zero feeRecipient required");
      }
      args = [nftContract, feeRecipient, ZERO, quantity];
      value = priceWei * (quantity > 0n ? quantity : 1n);
    } else {
      args = buildCallArgs(fn, null, receiverAddress, staticArgs);
      value =
        fn.stateMutability === "payable"
          ? computeMintValue(fn, staticArgs, priceWei)
          : undefined;
    }

    const data = encodeFunctionData({
      abi,
      functionName: campaign.mintFunctionName,
      args: args as never,
    });

    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });

    prepared.push({
      itemId: item.id,
      address: receiverAddress,
      account,
      to: campaign.contractAddress as Address,
      data,
      value,
      nonce,
    });
  }

  // ── WAIT UNTIL T ───────────────────────────────────────────────────────
  const fireAt = opts.fireAt ?? campaign.scheduledAt;
  if (fireAt) {
    await waitUntilWallClock(fireAt, { maxEarlyMs: 180_000 });
  }
  if (chainStartUnix != null && chainStartUnix > 0n) {
    await waitUntilChainTime(publicClient, chainStartUnix, { maxWaitMs: 45_000 });
  }

  // ── BLAST (parallel) ───────────────────────────────────────────────────
  await Promise.all(
    prepared.map(async (p) => {
      try {
        const walletClient = createWalletClient({
          account: p.account,
          chain: meta.chain,
          transport: http(rpc),
        });

        const hash = await walletClient.sendTransaction({
          account: p.account,
          chain: meta.chain,
          to: p.to,
          data: p.data,
          value: p.value,
          nonce: p.nonce,
          ...(opts.maxFeePerGasWei ? { maxFeePerGas: BigInt(opts.maxFeePerGasWei) } : {}),
          ...(opts.maxPriorityFeePerGasWei
            ? { maxPriorityFeePerGas: BigInt(opts.maxPriorityFeePerGasWei) }
            : {}),
        });

        await prisma.mintRunItem.update({
          where: { id: p.itemId },
          data: { status: "SUBMITTED", txHash: hash },
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: hash as Hex,
        });

        await prisma.mintRunItem.update({
          where: { id: p.itemId },
          data: {
            status: receipt.status === "success" ? "CONFIRMED" : "FAILED",
            gasUsedWei: receipt.gasUsed?.toString(),
            effectiveGasPriceWei: receipt.effectiveGasPrice?.toString(),
            errorMessage:
              receipt.status === "success" ? null : "Transaction mined but reverted",
          },
        });
      } catch (e) {
        await prisma.mintRunItem.update({
          where: { id: p.itemId },
          data: {
            status: "FAILED",
            errorMessage: extractRevertReason(e),
          },
        });
      }
    })
  );

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
      message: `Self-mint FCFS ${status}: ${ok} ok, ${bad} failed`,
      metadata: { runId: run.id, campaignId: campaign.id, mode: "SELF_MINT" },
    },
  });

  return { runId: run.id, status, ok, bad };
}