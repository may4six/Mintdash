import { http, createConfig, fallback } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
} from "wagmi/chains";
import { getRpcUrl, robinhood } from "@/lib/constants";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const chains = [
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  robinhood,
] as const;

function transportFor(chainId: number) {
  const alchemyUrl = getRpcUrl(chainId);
  return fallback([...(alchemyUrl ? [http(alchemyUrl)] : []), http()]);
}

export const wagmiConfig = createConfig({
  chains,
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    [mainnet.id]: transportFor(mainnet.id),
    [base.id]: transportFor(base.id),
    [arbitrum.id]: transportFor(arbitrum.id),
    [optimism.id]: transportFor(optimism.id),
    [polygon.id]: transportFor(polygon.id),
    [robinhood.id]: transportFor(robinhood.id),
  },
});