import { http, createConfig, fallback } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import {
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
} from "wagmi/chains";
import { getRpcUrl, robinhood, robinhoodTestnet } from "@/lib/constants";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const chains = [
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  robinhood,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  polygonAmoy,
  robinhoodTestnet,
] as const;

function transportFor(chainId: number) {
  const alchemy = getRpcUrl(chainId);
  return fallback([
    ...(alchemy ? [http(alchemy)] : []),
    http(),
  ]);
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
    [sepolia.id]: transportFor(sepolia.id),
    [baseSepolia.id]: transportFor(baseSepolia.id),
    [arbitrumSepolia.id]: transportFor(arbitrumSepolia.id),
    [optimismSepolia.id]: transportFor(optimismSepolia.id),
    [polygonAmoy.id]: transportFor(polygonAmoy.id),
    [robinhoodTestnet.id]: transportFor(robinhoodTestnet.id),
  },
});
