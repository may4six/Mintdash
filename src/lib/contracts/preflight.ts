import { createPublicClient, http, type Abi, type Address } from "viem";
import { getChainMeta, getRpcUrl, GAS_SAFETY_MARGIN_BPS } from "@/lib/constants";
import {
  findAbiFunction,
  findEligibilityView,
  buildCallArgs,
  requiresReceiverSignature,
  computeMintValue,
} from "@/lib/contracts/abi";
import { extractRevertReason, SEADROP_ERRORS_ABI } from "@/lib/contracts/errors";
import {
  isAllowListCampaign,
  buildAllowListArgsFromStatic,
  allowListMintValue,
} from "@/lib/sniper/seadropAllowList";
import type { PreflightRequest } from "@/lib/validations";
import type { EligibilityStatus, PreflightReceiverResult, PreflightResult } from "@/types";

function getServerPublicClient(chainId: number) {
  const meta = getChainMeta(chainId);
  // Prefer explicit RPC (Alchemy when available, else chain default from getRpcUrl).
  const url = getRpcUrl(chainId);
  return createPublicClient({
    chain: meta.chain,
    transport: http(url),
  });
}

function applyMargin(gas: bigint): bigint {
  return (gas * BigInt(10_000 + GAS_SAFETY_MARGIN_BPS)) / 10_000n;
}

/** Merge SeaDrop error fragments so estimateContractGas can decode custom reverts. */
function abiForSimulation(base: Abi, mintFunctionName: string): Abi {
  if (mintFunctionName === "mintPublic" || mintFunctionName === "mintAllowList") {
    return [...base, ...SEADROP_ERRORS_ABI] as Abi;
  }
  return base;
}

export async function runPreflight(req: PreflightRequest): Promise<PreflightResult> {
  const client = getServerPublicClient(req.chainId);
  const abi = req.abi as unknown as Abi;
  const simAbi = abiForSimulation(abi, req.mintFunctionName);
  const fn = findAbiFunction(abi, req.mintFunctionName);
  const priceWei = BigInt(req.priceWeiPerMint || "0");
  const needsReceiverSig = requiresReceiverSignature(req.recipientParam);
  const allowList = isAllowListCampaign(req.mintFunctionName);
  const staticArgs = (req.staticArgs ?? {}) as Record<string, unknown>;

  if (!fn) {
    throw new Error(`Function "${req.mintFunctionName}" not found in the provided ABI.`);
  }

  // Guardrail: SeaDrop mint functions must target the SeaDrop contract, not the NFT.
  if (
    (req.mintFunctionName === "mintPublic" || req.mintFunctionName === "mintAllowList") &&
    staticArgs.nftContract &&
    String(staticArgs.nftContract).toLowerCase() === req.contractAddress.toLowerCase()
  ) {
    // Same address for contract and nftContract is almost always a misconfig.
    // We still simulate, but the decoded error will guide the user.
  }

  const code = await client.getCode({ address: req.contractAddress as Address });
  const contractHasCode = !!code && code !== "0x";

  const operatorBalanceWei = await client.getBalance({ address: req.operatorAddress as Address });

  const feeEstimate = await client.estimateFeesPerGas().catch(() => null);
  const suggestedMaxFeePerGasWei = (feeEstimate?.maxFeePerGas ?? 30_000_000_000n).toString();
  const suggestedMaxPriorityFeePerGasWei = (feeEstimate?.maxPriorityFeePerGas ?? 1_500_000_000n).toString();

  const eligibilityView = req.phase === "WHITELIST" ? findEligibilityView(abi) : undefined;

  const receiverResults: PreflightReceiverResult[] = [];
  let totalGasWei = 0n;

  for (const receiver of req.receivers) {
    let eligibility: EligibilityStatus = "UNKNOWN";
    let eligibilityNote: string | null = null;

    if (req.phase === "WHITELIST") {
      if (eligibilityView) {
        try {
          const isEligible = await client.readContract({
            address: req.contractAddress as Address,
            abi,
            functionName: eligibilityView.name,
            args: [receiver.address as Address],
          });
          eligibility = isEligible ? "ELIGIBLE" : "INELIGIBLE";
          eligibilityNote = `Checked on-chain via ${eligibilityView.name}(address)`;
        } catch {
          eligibilityNote = `Could not call ${eligibilityView.name} — verify eligibility manually`;
        }
      } else {
        eligibilityNote =
          "No on-chain eligibility view detected in this ABI — verify against the project's allowlist yourself before running.";
      }
    }

    if (!contractHasCode) {
      receiverResults.push({
        walletId: receiver.walletId,
        address: receiver.address,
        gasEstimateWei: null,
        eligibility,
        eligibilityNote,
        ready: false,
        blockReason: "No contract code at this address on this chain.",
      });
      continue;
    }

    if (req.phase === "WHITELIST" && eligibility === "INELIGIBLE") {
      receiverResults.push({
        walletId: receiver.walletId,
        address: receiver.address,
        gasEstimateWei: null,
        eligibility,
        eligibilityNote,
        ready: false,
        blockReason: "Not eligible for the whitelist phase.",
      });
      continue;
    }

    // Early static validation for SeaDrop public path
    if (req.mintFunctionName === "mintPublic") {
      const fee = String(staticArgs.feeRecipient ?? "").trim();
      const nft = String(staticArgs.nftContract ?? "").trim();
      if (!nft || !/^0x[0-9a-fA-F]{40}$/.test(nft)) {
        receiverResults.push({
          walletId: receiver.walletId,
          address: receiver.address,
          gasEstimateWei: null,
          eligibility,
          eligibilityNote,
          ready: false,
          blockReason:
            "staticArgValues.nftContract missing or invalid. For SeaDrop, put the NFT collection address here and set contractAddress to the SeaDrop contract.",
        });
        continue;
      }
      if (!fee || fee === "0x0000000000000000000000000000000000000000") {
        receiverResults.push({
          walletId: receiver.walletId,
          address: receiver.address,
          gasEstimateWei: null,
          eligibility,
          eligibilityNote,
          ready: false,
          blockReason:
            "feeRecipient is missing or zero. Use Resolve fee recipient (or getAllowedFeeRecipients on SeaDrop).",
        });
        continue;
      }
    }

    const simulatedCaller = needsReceiverSig
      ? (receiver.address as Address)
      : (req.operatorAddress as Address);

    try {
      const args = allowList
        ? buildAllowListArgsFromStatic(staticArgs, receiver.address as Address)
        : buildCallArgs(fn, req.recipientParam, receiver.address, staticArgs);

      const value = allowList
        ? allowListMintValue(staticArgs, priceWei)
        : fn.stateMutability === "payable"
          ? computeMintValue(fn, staticArgs, priceWei)
          : undefined;

      const gas = await client.estimateContractGas({
        address: req.contractAddress as Address,
        abi: simAbi,
        functionName: fn.name,
        args,
        account: simulatedCaller,
        value,
      });
      const gasWithMargin = applyMargin(gas);
      if (!needsReceiverSig) {
        totalGasWei += gasWithMargin * BigInt(suggestedMaxFeePerGasWei);
      }
      receiverResults.push({
        walletId: receiver.walletId,
        address: receiver.address,
        gasEstimateWei: gasWithMargin.toString(),
        eligibility,
        eligibilityNote: needsReceiverSig
          ? [eligibilityNote, "This function has no recipient param — the receiver must sign and pay its own gas for this mint."]
              .filter(Boolean)
              .join(" ")
          : eligibilityNote,
        ready: true,
        blockReason: null,
      });
    } catch (error) {
      receiverResults.push({
        walletId: receiver.walletId,
        address: receiver.address,
        gasEstimateWei: null,
        eligibility,
        eligibilityNote,
        ready: false,
        blockReason: extractRevertReason(error),
      });
    }
  }

  const operatorPaidReceiverCount = receiverResults.filter((r) => r.ready && !needsReceiverSig).length;
  const totalMintPriceWei =
    (allowList
      ? allowListMintValue(staticArgs, priceWei)
      : priceWei) * BigInt(operatorPaidReceiverCount);
  const totalEstimatedCostWei = totalGasWei + totalMintPriceWei;

  const shortfall = totalEstimatedCostWei - operatorBalanceWei;
  const sufficientFunds = shortfall <= 0n;

  return {
    contractHasCode,
    operator: {
      address: req.operatorAddress,
      balanceWei: operatorBalanceWei.toString(),
      sufficientFunds,
      shortfallWei: sufficientFunds ? null : shortfall.toString(),
    },
    receivers: receiverResults,
    totalEstimatedCostWei: totalEstimatedCostWei.toString(),
    suggestedMaxFeePerGasWei,
    suggestedMaxPriorityFeePerGasWei,
    allReady: receiverResults.every((r) => r.ready) && sufficientFunds && contractHasCode,
    requiresReceiverSignature: needsReceiverSig,
  };
}