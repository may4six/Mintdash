"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { createWalletClient, http, type Address, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  hasEncryptedSigner,
  loadEncryptedSigner,
  removeEncryptedSigner,
  saveEncryptedSigner,
} from "@/lib/wallet/localSigner";
import { getChainMeta, getRpcUrl } from "@/lib/constants";

export type OperatorSignerMode = "connected" | "local-locked" | "local-unlocked" | "none";

function normalizePrivateKey(raw: string): `0x${string}` {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const withPrefix =
    trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed : `0x${trimmed}`;
  const hexBody = withPrefix.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(hexBody)) {
    throw new Error(
      "Invalid private key: expected 64 hex characters (with or without 0x prefix)."
    );
  }
  return (`0x${hexBody.toLowerCase()}`) as `0x${string}`;
}

interface UseOperatorSignerResult {
  mode: OperatorSignerMode;
  isReady: boolean;
  hasLocalSigner: boolean;
  importLocalKey: (rawPrivateKey: string, passphrase: string) => Promise<void>;
  unlockLocalKey: (passphrase: string) => Promise<void>;
  lockLocalKey: () => void;
  forgetLocalKey: () => void;
  getWalletClient: () => Promise<WalletClient>;
}

export function useOperatorSigner(
  operatorAddress: Address | null,
  chainId: number
): UseOperatorSignerResult {
  const { address: connectedAddress } = useAccount();
  const { data: connectedWalletClient } = useWalletClient({ chainId });
  const [unlockedKey, setUnlockedKey] = useState<`0x${string}` | null>(null);
  const [unlockedFor, setUnlockedFor] = useState<Address | null>(null);
  const [hasLocalSigner, setHasLocalSigner] = useState(false);

  useEffect(() => {
    setHasLocalSigner(!!operatorAddress && hasEncryptedSigner(operatorAddress));
    setUnlockedKey(null);
    setUnlockedFor(null);
  }, [operatorAddress]);

  const isConnectedMatch =
    !!operatorAddress &&
    !!connectedAddress &&
    connectedAddress.toLowerCase() === operatorAddress.toLowerCase();

  const isLocalUnlocked =
    !!unlockedKey &&
    !!operatorAddress &&
    unlockedFor?.toLowerCase() === operatorAddress.toLowerCase();

  const mode: OperatorSignerMode = isConnectedMatch
    ? "connected"
    : isLocalUnlocked
      ? "local-unlocked"
      : hasLocalSigner
        ? "local-locked"
        : "none";

  const importLocalKey = useCallback(
    async (rawPrivateKey: string, passphrase: string) => {
      if (!operatorAddress) throw new Error("No Operator wallet selected.");
      const privateKeyHex = normalizePrivateKey(rawPrivateKey);
      const account = privateKeyToAccount(privateKeyHex);
      if (account.address.toLowerCase() !== operatorAddress.toLowerCase()) {
        throw new Error(
          `That key belongs to ${account.address}, not the selected Operator ${operatorAddress}.`
        );
      }
      const record = await encryptPrivateKey(operatorAddress, privateKeyHex, passphrase);
      saveEncryptedSigner(record);
      setHasLocalSigner(true);
      setUnlockedKey(privateKeyHex);
      setUnlockedFor(operatorAddress);
    },
    [operatorAddress]
  );

  const unlockLocalKey = useCallback(
    async (passphrase: string) => {
      if (!operatorAddress) throw new Error("No Operator wallet selected.");
      const record = loadEncryptedSigner(operatorAddress);
      if (!record) throw new Error("No local signer saved for this wallet.");
      const pk = (await decryptPrivateKey(record, passphrase)) as `0x${string}`;
      setUnlockedKey(pk);
      setUnlockedFor(operatorAddress);
    },
    [operatorAddress]
  );

  const lockLocalKey = useCallback(() => {
    setUnlockedKey(null);
    setUnlockedFor(null);
  }, []);

  const forgetLocalKey = useCallback(() => {
    if (!operatorAddress) return;
    removeEncryptedSigner(operatorAddress);
    setHasLocalSigner(false);
    lockLocalKey();
  }, [operatorAddress, lockLocalKey]);

  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (isConnectedMatch && connectedWalletClient) {
      return connectedWalletClient;
    }
    if (isLocalUnlocked && unlockedKey) {
      const meta = getChainMeta(chainId);
      const account = privateKeyToAccount(unlockedKey);
      const rpc = getRpcUrl(chainId);
      return createWalletClient({
        account,
        chain: meta.chain,
        transport: http(rpc),
      });
    }
    throw new Error(
      "Operator wallet isn't ready to sign - connect it or unlock the local signer first."
    );
  }, [isConnectedMatch, connectedWalletClient, isLocalUnlocked, unlockedKey, chainId]);

  return {
    mode,
    isReady: mode === "connected" || mode === "local-unlocked",
    hasLocalSigner,
    importLocalKey,
    unlockLocalKey,
    lockLocalKey,
    forgetLocalKey,
    getWalletClient,
  };
}
