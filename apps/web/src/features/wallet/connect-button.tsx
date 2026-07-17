"use client";

import { useAppKit } from "@reown/appkit/react";
import { WalletCards } from "lucide-react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import { BASE_SEPOLIA_CHAIN_ID } from "./contracts";

export function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (isConnected && chainId !== BASE_SEPOLIA_CHAIN_ID) {
    return (
      <Button
        loading={isPending}
        onClick={() => switchChain({ chainId: BASE_SEPOLIA_CHAIN_ID })}
        variant="destructive"
      >
        Switch to Base Sepolia
      </Button>
    );
  }

  return (
    <Button
      icon={<WalletCards aria-hidden="true" />}
      onClick={() => void open({ view: isConnected ? "Account" : "Connect" })}
    >
      {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"}
    </Button>
  );
}
