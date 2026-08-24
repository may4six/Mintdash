import { BaseError, ContractFunctionRevertedError } from "viem";

/** Turn a viem error (or anything else) into a short, human-readable reason. */
export function extractRevertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const revertError = error.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.data?.errorName ?? revertError.shortMessage ?? "Call would revert";
    }
    return error.shortMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
