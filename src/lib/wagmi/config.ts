import { http, createConfig, fallback } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { mainnet, sepolia } from "wagmi/chains";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const mainnetRpcUrl = process.env.NEXT_PUBLIC_MAINNET_RPC_URL;
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

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
    // fallback() tries the configured RPC first and drops to the chain's
    // public default if it's unset or errors, so the app still works
    // (rate-limited) before the user adds their own Alchemy/Infura URL.
    [mainnet.id]: fallback([
      ...(mainnetRpcUrl ? [http(mainnetRpcUrl)] : []),
      http(),
    ]),
    [sepolia.id]: fallback([
      ...(sepoliaRpcUrl ? [http(sepoliaRpcUrl)] : []),
      http(),
    ]),
  },
});
