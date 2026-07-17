"use client";

import { createAppKit } from "@reown/appkit/react";
import { baseSepolia } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";

const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ??
  "00000000000000000000000000000000";
const networks: [typeof baseSepolia] = [baseSepolia];
const wagmiAdapter = new WagmiAdapter({ networks, projectId, ssr: true });

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: "Poker Next",
    description: "Base Sepolia testnet poker",
    url: process.env.NEXT_PUBLIC_WALLET_LOGIN_URI ?? "http://localhost:3100",
    icons: [],
  },
  defaultNetwork: baseSepolia,
  features: { analytics: false, email: false, socials: false },
});

const queryClient = new QueryClient();

export function PokerAppKitProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
