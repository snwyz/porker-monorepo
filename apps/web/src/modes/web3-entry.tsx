"use client";

import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSignMessage,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { DepositDialog } from "@/features/balance/deposit-dialog";
import { WithdrawDialog } from "@/features/balance/withdraw-dialog";
import { PokerAppKitProvider } from "@/features/wallet/appkit-provider";
import { ConnectButton } from "@/features/wallet/connect-button";
import {
  BASE_SEPOLIA_CHAIN_ID,
  escrowAddress,
  tokenAbi,
  tokenAddress,
} from "@/features/wallet/contracts";
import { signedLogin } from "@/features/wallet/signed-login";
import { getEscrowBalance } from "@/features/wallet/web3-api";
import {
  PageIntro,
  PointsNavigation,
  PointsPage as PointsShell,
} from "./points-entry";

export { PageIntro, PointsNavigation };

function display(value: bigint | undefined | null) {
  return value == null ? "—" : Number(formatUnits(value, 18)).toLocaleString();
}

function Web3BalanceContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [authenticatedAddress, setAuthenticatedAddress] =
    useState<Address | null>(null);
  const [escrowState, setEscrowState] = useState<{
    address: Address;
    balance: bigint;
  } | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [error, setError] = useState("");
  const authenticated =
    address !== undefined && authenticatedAddress === address;
  const escrow =
    address !== undefined && escrowState?.address === address
      ? escrowState.balance
      : null;
  const walletBalance = useReadContract({
    address: tokenAddress ?? undefined,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && tokenAddress) },
  });

  const refreshEscrow = useCallback(async () => {
    if (!authenticated || !address) return;
    const balance = await getEscrowBalance();
    setEscrowState({ address, balance: BigInt(balance.escrow) });
  }, [address, authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => void refreshEscrow(), 4_000);
    return () => window.clearInterval(timer);
  }, [authenticated, refreshEscrow]);

  async function login() {
    if (!address) return;
    setAuthPending(true);
    setError("");
    try {
      await signedLogin(address, (message) => signMessageAsync({ message }));
      const balance = await getEscrowBalance();
      setAuthenticatedAddress(address);
      setEscrowState({ address, balance: BigInt(balance.escrow) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed");
    } finally {
      setAuthPending(false);
    }
  }

  const ready =
    isConnected &&
    chainId === BASE_SEPOLIA_CHAIN_ID &&
    authenticated &&
    Boolean(tokenAddress && escrowAddress);

  return (
    <main className="mx-auto w-[min(100%-2rem,54rem)] py-10">
      <PageIntro eyebrow="Base Sepolia only" title="Web3 balance">
        Wallet tokens and server-confirmed escrow are deliberately separate.
        All assets on this page are valueless testnet assets.
      </PageIntro>
      <section className="grid gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl shadow-black/15">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ConnectButton />
          {address && chainId === BASE_SEPOLIA_CHAIN_ID && !authenticated ? (
            <Button
              icon={<ShieldCheck aria-hidden="true" />}
              loading={authPending}
              loadingText="Signing in"
              onClick={() => void login()}
              variant="secondary"
            >
              Sign in with wallet
            </Button>
          ) : null}
        </div>
        {!tokenAddress || !escrowAddress ? (
          <p className="error m-0" role="alert">
            Base Sepolia contract addresses are not configured.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--surface-raised)] p-4">
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Wallet token balance</span>
            <p className="m-0 mt-2 text-3xl font-semibold tabular-nums" data-testid="wallet-token-balance">
              {display(walletBalance.data)} MPT
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface-raised)] p-4">
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Server-confirmed escrow</span>
            <p className="m-0 mt-2 text-3xl font-semibold tabular-nums" data-testid="server-escrow-balance">
              {display(escrow)} MPT
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <DepositDialog
            disabled={!ready}
            onConfirmed={(balance) =>
              address && setEscrowState({ address, balance })
            }
          />
          <WithdrawDialog
            disabled={!ready || (escrow ?? BigInt(0)) === BigInt(0)}
            onConfirmed={(balance) =>
              address && setEscrowState({ address, balance })
            }
          />
        </div>
        {error ? <p className="error m-0" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}

export function BalanceModeContent() {
  return <Web3BalanceContent />;
}

export function PointsPage({
  children,
  table = false,
}: {
  children: ReactNode;
  table?: boolean;
}) {
  return (
    <PokerAppKitProvider>
      <PointsShell table={table}>{children}</PointsShell>
    </PokerAppKitProvider>
  );
}
