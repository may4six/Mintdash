import { http, createConfig, fallback } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";
import { getRpcUrl } from "@/lib/constants";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    injected(),
    // Only registered if a project ID is configured — an unconfigured
    // WalletConnect connector throws at connect-time, so we'd rather it
    // not appear as an option at all than appear and fail.
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    // fallback() tries Alchemy first (built from NEXT_PUBLIC_ALCHEMY_API_KEY)
    // and drops to the chain's public default if the key's unset or errors,
    // so the app still works (rate-limited) before a key is configured.
    [mainnet.id]: fallback([
      ...(getRpcUrl(mainnet.id) ? [http(getRpcUrl(mainnet.id))] : []),
      http(),
    ]),
    [sepolia.id]: fallback([
      ...(getRpcUrl(sepolia.id) ? [http(getRpcUrl(sepolia.id))] : []),
      http(),
    ]),
  },
});
