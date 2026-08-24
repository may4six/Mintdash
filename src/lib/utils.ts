import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes, letting later classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Shorten a 0x address to 0x1234…abcd for display. */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length < chars * 2 + 4) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** Shorten a tx hash the same way, with a slightly wider default. */
export function shortenHash(hash: string, chars = 6): string {
  return shortenAddress(hash, chars);
}

/** Format a wei string/bigint as an ETH string with a sensible number of decimals. */
export function formatWeiToEth(wei: string | bigint, maxDecimals = 5): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000_000_000_000_000n;
  const fraction = abs % 1_000_000_000_000_000_000n;
  const fractionStr = fraction.toString().padStart(18, "0").slice(0, maxDecimals);
  const trimmed = fractionStr.replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return trimmed.length > 0 ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`;
}

/** Relative time string ("3m ago") for the activity feed. */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
