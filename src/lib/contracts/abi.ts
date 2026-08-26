import type { Abi, AbiFunction, AbiParameter } from "viem";
import {
  MINT_FUNCTION_NAME_HINTS,
  RECIPIENT_PARAM_NAME_HINTS,
  ELIGIBILITY_VIEW_NAME_HINTS,
} from "@/lib/constants";

/** Every function that can change state — the universe of possible "mint" calls. */
export function getWritableFunctions(abi: Abi): AbiFunction[] {
  return abi.filter(
    (item): item is AbiFunction =>
      item.type === "function" &&
      (item.stateMutability === "payable" || item.stateMutability === "nonpayable")
  );
}

/** Writable functions whose name looks mint-like, ranked first; falls back to
 * the full writable set if nothing matches so an unusually-named function
 * (e.g. a custom "claimDrop") can still be picked manually. */
export function getLikelyMintFunctions(abi: Abi): AbiFunction[] {
  const writable = getWritableFunctions(abi);
  const hinted = writable.filter((fn) =>
    MINT_FUNCTION_NAME_HINTS.some((hint) => fn.name.toLowerCase().includes(hint))
  );
  return hinted.length > 0 ? hinted : writable;
}

export function findAbiFunction(abi: Abi, name: string): AbiFunction | undefined {
  return getWritableFunctions(abi).find((fn) => fn.name === name);
}

/**
 * Index of the address-typed input that looks like a mint recipient, or
 * null if none is found. When null, the function has no way to mint to an
 * address other than msg.sender — see recipientParam docs on Campaign.
 */
export function findRecipientParamName(fn: AbiFunction): string | null {
  const match = fn.inputs.find(
    (input): input is AbiParameter & { name: string } =>
      input.type === "address" &&
      !!input.name &&
      RECIPIENT_PARAM_NAME_HINTS.some((hint) => input.name!.toLowerCase().includes(hint))
  );
  return match?.name ?? null;
}

/** All read-only (view/pure) functions — used to look for a whitelist checker or price getter. */
export function getViewFunctions(abi: Abi): AbiFunction[] {
  return abi.filter(
    (item): item is AbiFunction =>
      item.type === "function" && (item.stateMutability === "view" || item.stateMutability === "pure")
  );
}

/** Best-effort: a no-arg uint256 getter whose name suggests it returns the mint price. */
export function findPriceGetter(abi: Abi): AbiFunction | undefined {
  const priceHints = ["price", "cost", "mintprice"];
  return getViewFunctions(abi).find(
    (fn) =>
      fn.inputs.length === 0 &&
      fn.outputs.length === 1 &&
      fn.outputs[0]?.type === "uint256" &&
      priceHints.some((hint) => fn.name.toLowerCase().includes(hint))
  );
}

/** Best-effort: a single-address view function that looks like an eligibility check. */
export function findEligibilityView(abi: Abi): AbiFunction | undefined {
  return getViewFunctions(abi).find(
    (fn) =>
      fn.inputs.length === 1 &&
      fn.inputs[0]?.type === "address" &&
      fn.outputs.length === 1 &&
      fn.outputs[0]?.type === "bool" &&
      ELIGIBILITY_VIEW_NAME_HINTS.some((hint) => fn.name.toLowerCase().includes(hint))
  );
}

/** Build ordered args for a call, substituting the receiver address into the
 * recipient slot (if any) and pulling everything else from staticArgs. */
export function buildCallArgs(
  fn: AbiFunction,
  recipientParam: string | null,
  receiverAddress: string,
  staticArgs: Record<string, unknown>
): unknown[] {
  return fn.inputs.map((input) => {
    if (recipientParam && input.name === recipientParam) {
      return receiverAddress;
    }
    const raw = staticArgs[input.name ?? ""];
    if (raw === undefined || raw === null) return raw;
    return coerceArgValue(input.type, String(raw));
  });
}

/** True when the ABI can't route the mint to an arbitrary address, meaning
 * only the receiver's own signature can put the NFT in their own wallet. */
export function requiresReceiverSignature(recipientParam: string | null): boolean {
  return recipientParam === null;
}

/** Coerce a user-typed string into the JS/viem value a given Solidity type expects. */
export function coerceArgValue(abiType: string, raw: string): unknown {
  const trimmed = raw.trim();
  if (abiType.endsWith("[]")) {
    if (trimmed.length === 0) return [];
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error(`Expected a JSON array for ${abiType}, e.g. ["0x..","0x.."]`);
    const elementType = abiType.slice(0, -2);
    return parsed.map((el) => coerceArgValue(elementType, String(el)));
  }
  if (abiType.startsWith("uint") || abiType.startsWith("int")) {
    return BigInt(trimmed);
  }
  if (abiType === "bool") {
    return trimmed.toLowerCase() === "true";
  }
  // address, bytes, bytesN, string all pass through as-is.
  return trimmed;
}
