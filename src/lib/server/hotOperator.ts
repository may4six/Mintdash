import { createWalletClient, createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainMeta, getRpcUrl } from "@/lib/constants";

export function getHotOperatorAccount() {
  const raw = process.env.OPERATOR_PRIVATE_KEY;
  if (!raw) throw new Error("OPERATOR_PRIVATE_KEY is not set");
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  return privateKeyToAccount(key);
}

export function getHotClients(chainId: number) {
  const meta = getChainMeta(chainId);
  const rpc = getRpcUrl(chainId) ?? meta.chain.rpcUrls.default.http[0];
  const account = getHotOperatorAccount();
  const publicClient = createPublicClient({
    chain: meta.chain,
    transport: http(rpc),
  });
  const walletClient = createWalletClient({
    account,
    chain: meta.chain,
    transport: http(rpc),
  });
  return { account, publicClient, walletClient, meta, operatorAddress: account.address as Address };
}