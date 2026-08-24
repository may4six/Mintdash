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
import { getChainMeta } from "@/lib/constants";

export type OperatorSignerMode = "connected" | "local-locked" | "local-unlocked" | "none";

interface UseOperatorSignerResult {
  mode: OperatorSignerMode;
  isReady: boolean;
  hasLocalSigner: boolean;
  importLocalKey: (privateKeyHex: `0x${string}`, passphrase: string) => Promise<void>;
  unlockLocalKey: (passphrase: string) => Promise<void>;
  lockLocalKey: () => void;
  forgetLocalKey: () => void;
  getWalletClient: () => Promise<WalletClient>;
}

export function useOperatorSigner(operatorAddress: Address | null, chainId: number): UseOperatorSignerResult {
  const { address: connectedAddress } = useAccount();
  const { data: connectedWalletClient } = useWalletClient({ chainId });
  const [unlockedKey, setUnlockedKey] = useState<`0x${string}` | null>(null);
  const [unlockedFor, setUnlockedFor] = useState<Address | null>(null);

  // localStorage isn't available during SSR, and reading it synchronously
  // in the render body would make the server-rendered markup disagree with
  // the client's first render — start false everywhere, then correct after
  // mount, which only ever causes an extra client-side re-render, not a
  // hydration mismatch warning.
  const [hasLocalSigner, setHasLocalSigner] = useState(false);
  useEffect(() => {
    setHasLocalSigner(!!operatorAddress && hasEncryptedSigner(operatorAddress));
    // Selecting a different operator invalidates any previously-unlocked key.
    setUnlockedKey(null);
    setUnlockedFor(null);
  }, [operatorAddress]);

  const isConnectedMatch =
    !!operatorAddress && !!connectedAddress && connectedAddress.toLowerCase() === operatorAddress.toLowerCase();
  const isLocalUnlocked =
    !!unlockedKey && !!operatorAddress && unlockedFor?.toLowerCase() === operatorAddress.toLowerCase();

  const mode: OperatorSignerMode = isConnectedMatch
    ? "connected"
    : isLocalUnlocked
      ? "local-unlocked"
      : hasLocalSigner
        ? "local-locked"
        : "none";

  const importLocalKey = useCallback(
    async (privateKeyHex: `0x${string}`, passphrase: string) => {
      if (!operatorAddress) throw new Error("No Operator wallet selected.");
      const account = privateKeyToAccount(privateKeyHex);
      if (account.address.toLowerCase() !== operatorAddress.toLowerCase()) {
        throw new Error(`That key belongs to ${account.address}, not the selected Operator ${operatorAddress}.`);
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
      const rpcUrl =
        chainId === 1 ? process.env.NEXT_PUBLIC_MAINNET_RPC_URL : process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
      return createWalletClient({ account, chain: meta.chain, transport: http(rpcUrl) });
    }
    throw new Error("Operator wallet isn't ready to sign — connect it or unlock the local signer first.");
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
