"use client";

import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, useChainId, useReadContract, useSignMessage } from "wagmi";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
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

function display(value: bigint | undefined | null, locale: string) {
  return value == null
    ? "—"
    : Number(formatUnits(value, 18)).toLocaleString(locale);
}

function Web3BalanceContent() {
  const { locale, t } = useI18n();
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
    } catch {
      setError(t("P000181"));
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
      <PageIntro eyebrow={t("P000204")} title={t("P000205")}>
        {t("P000206")}
      </PageIntro>
      <section className="grid gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl shadow-black/15">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ConnectButton />
          {address && chainId === BASE_SEPOLIA_CHAIN_ID && !authenticated ? (
            <Button
              icon={<ShieldCheck aria-hidden="true" />}
              loading={authPending}
              loadingText={t("P000208")}
              onClick={() => void login()}
              variant="secondary"
            >
              {t("P000207")}
            </Button>
          ) : null}
        </div>
        {!tokenAddress || !escrowAddress ? (
          <p className="error m-0" role="alert">
            {t("P000209")}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--surface-raised)] p-4">
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              {t("P000210")}
            </span>
            <p
              className="m-0 mt-2 text-3xl font-semibold tabular-nums"
              data-testid="wallet-token-balance"
            >
              {display(walletBalance.data, locale)} MPT
            </p>
          </div>
          <div className="rounded-xl bg-[var(--surface-raised)] p-4">
            <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              {t("P000211")}
            </span>
            <p
              className="m-0 mt-2 text-3xl font-semibold tabular-nums"
              data-testid="server-escrow-balance"
            >
              {display(escrow, locale)} MPT
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
        {error ? (
          <p className="error m-0" role="alert">
            {error}
          </p>
        ) : null}
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
