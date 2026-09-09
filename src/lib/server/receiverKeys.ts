import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * RECEIVER_PRIVATE_KEYS on Railway:
 *
 *   {"0xAddr1":"0xpriv64hex","0xAddr2":"0x..."}
 *
 * or:
 *
 *   0xpriv1,0xpriv2,0xpriv3
 */

export type ReceiverKeyMap = Map<string, Hex>;

let cached: ReceiverKeyMap | null = null;

function normalizeKey(raw: string): Hex {
  const k = raw.trim();
  if (!k) throw new Error("Empty private key entry");
  const with0x = (k.startsWith("0x") ? k : `0x${k}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(with0x)) {
    throw new Error("Invalid private key length/format (need 32 bytes hex)");
  }
  return with0x;
}

export function loadReceiverKeyMap(): ReceiverKeyMap {
  if (cached) return cached;

  const raw = process.env.RECEIVER_PRIVATE_KEYS?.trim();
  if (!raw) {
    throw new Error(
      "RECEIVER_PRIVATE_KEYS is not set. Add JSON map or comma-separated keys in Railway."
    );
  }

  const map: ReceiverKeyMap = new Map();

  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [addr, key] of Object.entries(parsed)) {
      if (!/^0x[0-9a-fA-F]{40}$/i.test(addr)) {
        throw new Error(`Invalid address key in RECEIVER_PRIVATE_KEYS: ${addr}`);
      }
      const hex = normalizeKey(key);
      const account = privateKeyToAccount(hex);
      const derived = account.address.toLowerCase();
      if (derived !== addr.toLowerCase()) {
        console.warn(
          `[receiverKeys] map key ${addr.toLowerCase()} derives to ${derived} — using derived`
        );
      }
      map.set(derived, hex);
    }
  } else {
    for (const part of raw.split(/[,\s]+/).filter(Boolean)) {
      const hex = normalizeKey(part);
      const account = privateKeyToAccount(hex);
      map.set(account.address.toLowerCase(), hex);
    }
  }

  if (map.size === 0) throw new Error("RECEIVER_PRIVATE_KEYS parsed to zero keys");

  cached = map;
  return map;
}

export function getReceiverAccount(address: Address) {
  const map = loadReceiverKeyMap();
  const key = map.get(address.toLowerCase());
  if (!key) {
    throw new Error(
      `No private key for receiver ${address}. Add it to RECEIVER_PRIVATE_KEYS.`
    );
  }
  return privateKeyToAccount(key);
}

export function hasReceiverKey(address: string): boolean {
  try {
    return loadReceiverKeyMap().has(address.toLowerCase());
  } catch {
    return false;
  }
}