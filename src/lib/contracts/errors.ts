import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * Human-readable messages for SeaDrop custom errors.
 * Keys match the Solidity error names in SeaDropErrorsAndEvents.sol.
 */
const SEADROP_ERROR_HINTS: Record<string, string> = {
  NotActive:
    "Public/allowlist stage is not active (startTime/endTime). Window closed or not started yet.",
  MintQuantityCannotBeZero: "Quantity cannot be zero.",
  MintQuantityExceedsMaxMintedPerWallet:
    "This wallet already hit maxTotalMintableByWallet for this stage.",
  MintQuantityExceedsMaxSupply: "Mint would exceed collection max supply.",
  MintQuantityExceedsMaxTokenSupplyForStage:
    "Mint would exceed maxTokenSupplyForStage for this drop stage.",
  FeeRecipientCannotBeZeroAddress:
    "feeRecipient is the zero address. SeaDrop rejects 0x0 — set a real fee recipient.",
  FeeRecipientNotPresent: "feeRecipient is not registered on this drop.",
  FeeRecipientNotAllowed:
    "feeRecipient is not on the allowed list (restrictFeeRecipients is true). Resolve the allowed recipient from SeaDrop.",
  IncorrectPayment:
    "msg.value does not match required mint price × quantity. Check priceWeiPerMint and quantity.",
  InvalidProof: "Merkle proof is invalid for this minter + mintParams leaf.",
  PayerNotAllowed: "Operator (payer) is not on the allowed payers list for this drop.",
  PayerCannotBeZeroAddress: "Payer cannot be zero.",
  OnlyINonFungibleSeaDropToken:
    "Call must go through SeaDrop, not the NFT. contractAddress should be the canonical SeaDrop address.",
  InvalidSignature: "Signed-mint signature is invalid.",
  SignatureAlreadyUsed: "This signed-mint signature was already used.",
  SignerNotPresent: "Signer is not an allowed SeaDrop signer for this NFT.",
};

/** ABI fragments so viem can decode SeaDrop custom errors during estimate/call. */
export const SEADROP_ERRORS_ABI = [
  { type: "error", name: "NotActive", inputs: [{ name: "currentTimestamp", type: "uint256" }, { name: "startTimestamp", type: "uint256" }, { name: "endTimestamp", type: "uint256" }] },
  { type: "error", name: "MintQuantityCannotBeZero", inputs: [] },
  { type: "error", name: "MintQuantityExceedsMaxMintedPerWallet", inputs: [{ name: "total", type: "uint256" }, { name: "allowed", type: "uint256" }] },
  { type: "error", name: "MintQuantityExceedsMaxSupply", inputs: [{ name: "total", type: "uint256" }, { name: "maxSupply", type: "uint256" }] },
  { type: "error", name: "MintQuantityExceedsMaxTokenSupplyForStage", inputs: [{ name: "total", type: "uint256" }, { name: "maxTokenSupplyForStage", type: "uint256" }] },
  { type: "error", name: "FeeRecipientCannotBeZeroAddress", inputs: [] },
  { type: "error", name: "FeeRecipientNotPresent", inputs: [] },
  { type: "error", name: "FeeRecipientNotAllowed", inputs: [] },
  { type: "error", name: "IncorrectPayment", inputs: [{ name: "got", type: "uint256" }, { name: "want", type: "uint256" }] },
  { type: "error", name: "InvalidProof", inputs: [] },
  { type: "error", name: "PayerNotAllowed", inputs: [] },
  { type: "error", name: "PayerCannotBeZeroAddress", inputs: [] },
  { type: "error", name: "OnlyINonFungibleSeaDropToken", inputs: [{ name: "sender", type: "address" }] },
  { type: "error", name: "InvalidSignature", inputs: [{ name: "recoveredSigner", type: "address" }] },
  { type: "error", name: "SignatureAlreadyUsed", inputs: [] },
  { type: "error", name: "SignerNotPresent", inputs: [] },
] as const;

function formatErrorArgs(args: unknown): string {
  if (args == null) return "";
  if (Array.isArray(args)) {
    return args.map((a) => String(a)).join(", ");
  }
  if (typeof args === "object") {
    return Object.entries(args as Record<string, unknown>)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ");
  }
  return String(args);
}

function hintForErrorName(name: string, args?: unknown): string {
  const base = SEADROP_ERROR_HINTS[name] ?? name;
  const argStr = formatErrorArgs(args);
  return argStr ? `${base} (${argStr})` : base;
}

/**
 * Turn a viem / RPC error into a short, actionable reason.
 * Prefers decoded custom error names (SeaDrop etc.) over generic
 * "The contract function X reverted."
 */
export function extractRevertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const revertError = error.walk((err) => err instanceof ContractFunctionRevertedError);

    if (revertError instanceof ContractFunctionRevertedError) {
      const name = revertError.data?.errorName;
      if (name) {
        return hintForErrorName(name, revertError.data?.args);
      }

      const short = revertError.shortMessage ?? "";
      const details = (revertError as { details?: string }).details ?? "";
      const combined = `${short} ${details}`;

      for (const key of Object.keys(SEADROP_ERROR_HINTS)) {
        if (combined.includes(key)) {
          return hintForErrorName(key);
        }
      }

      const m = short.match(/reverted with the following reason:\s*(.+)/i);
      if (m?.[1]) return m[1].trim();

      if (short && !/contract function .+ reverted\.?$/i.test(short)) {
        return short;
      }

      return revertError.shortMessage ?? "Call would revert";
    }

    const full = `${error.shortMessage ?? ""} ${error.message ?? ""}`;
    for (const key of Object.keys(SEADROP_ERROR_HINTS)) {
      if (full.includes(key)) {
        return hintForErrorName(key);
      }
    }

    return error.shortMessage || error.message || "Call would revert";
  }

  if (error instanceof Error) {
    for (const key of Object.keys(SEADROP_ERROR_HINTS)) {
      if (error.message.includes(key)) {
        return hintForErrorName(key);
      }
    }
    return error.message;
  }

  return "Unknown error";
}