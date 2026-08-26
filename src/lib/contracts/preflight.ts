import { createPublicClient, http, type Abi, type Address } from "viem";
import { getChainMeta, getRpcUrl, GAS_SAFETY_MARGIN_BPS } from "@/lib/constants";
import { findAbiFunction, findEligibilityView, buildCallArgs, requiresReceiverSignature } from "@/lib/contracts/abi";
import { extractRevertReason } from "@/lib/contracts/errors";
import type { PreflightRequest } from "@/lib/validations";
import type { EligibilityStatus, PreflightReceiverResult, PreflightResult } from "@/types";

function getServerPublicClient(chainId: number) {
  const meta = getChainMeta(chainId);
  return createPublicClient({
    chain: meta.chain,
    transport: http(getRpcUrl(chainId)),
  });
}

function applyMargin(gas: bigint): bigint {
  return (gas * BigInt(10_000 + GAS_SAFETY_MARGIN_BPS)) / 10_000n;
}

export async function runPreflight(req: PreflightRequest): Promise<PreflightResult> {
  const client = getServerPublicClient(req.chainId);
  const abi = req.abi as unknown as Abi;
  const fn = findAbiFunction(abi, req.mintFunctionName);
  const priceWei = BigInt(req.priceWeiPerMint || "0");
  const needsReceiverSig = requiresReceiverSignature(req.recipientParam);

  if (!fn) {
    throw new Error(`Function "${req.mintFunctionName}" not found in the provided ABI.`);
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
          eligibilityNote = `Could not call ${eligibilityView.name} â€” verify eligibility manually`;
        }
      } else {
        eligibilityNote = "No on-chain eligibility view detected in this ABI â€” verify against the project's allowlist yourself before running.";
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

    // When there's no recipient param, msg.sender must be the receiver
    // itself, so we simulate as the receiver rather than the operator.
    // This is still a read-only eth_call/estimateGas â€” no signature or
    // private key needed to simulate "what if this address called it".
    const simulatedCaller = needsReceiverSig ? (receiver.address as Address) : (req.operatorAddress as Address);

    try {
      const args = buildCallArgs(fn, req.recipientParam, receiver.address, req.staticArgs);
      const gas = await client.estimateContractGas({
        address: req.contractAddress as Address,
        abi,
        functionName: fn.name,
        args,
        account: simulatedCaller,
        value: fn.stateMutability === "payable" ? priceWei : undefined,
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
          ? [eligibilityNote, "This function has no recipient param â€” the receiver must sign and pay its own gas for this mint."]
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
  const totalMintPriceWei = priceWei * BigInt(operatorPaidReceiverCount);
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
