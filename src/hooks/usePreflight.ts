"use client";

import { useMutation } from "@tanstack/react-query";
import type { PreflightRequest } from "@/lib/validations";
import type { PreflightResult } from "@/types";

async function requestPreflight(payload: PreflightRequest): Promise<PreflightResult> {
  const res = await fetch("/api/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Preflight check failed");
  }
  return data.result as PreflightResult;
}

export function usePreflight() {
  return useMutation<PreflightResult, Error, PreflightRequest>({
    mutationFn: requestPreflight,
  });
}
