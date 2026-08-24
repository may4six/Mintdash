"use client";

import * as React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { wagmiConfig } from "@/lib/wagmi/config";

export function Web3Provider({ children }: { children: React.ReactNode }) {
  // useState (not a module-level singleton) so each request/session gets
  // its own QueryClient — sharing one across requests on the server would
  // leak cached data between users, and this provider is client-only
  // anyway, but keeping the pattern consistent costs nothing.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
