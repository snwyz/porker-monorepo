"use client";

import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import {
  escrowAbi,
  escrowAddress,
  tokenAbi,
  tokenAddress,
} from "@/features/wallet/contracts";
import { getEscrowBalance } from "@/features/wallet/web3-api";

async function waitForEscrowCredit(previous: bigint): Promise<bigint> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = BigInt((await getEscrowBalance()).escrow);
    if (current > previous) return current;
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
  }
  throw new Error("DEPOSIT_CONFIRMATION_TIMEOUT");
}

export function DepositDialog({
  disabled,
  onConfirmed,
}: {
  disabled: boolean;
  onConfirmed: (balance: bigint) => void;
}) {
  const { t } = useI18n();
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("10");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  async function deposit() {
    if (!address || !client || !tokenAddress || !escrowAddress) return;
    setPending(true);
    setStatus("");
    try {
      const value = parseUnits(amount, 18);
      if (value <= BigInt(0)) throw new Error("INVALID_AMOUNT");
      const previous = BigInt((await getEscrowBalance()).escrow);
      const allowance = await client.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "allowance",
        args: [address, escrowAddress],
      });
      if (allowance < value) {
        setStatus(t("P000216"));
        const approvalHash = await writeContractAsync({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "approve",
          args: [escrowAddress, value],
        });
        await client.waitForTransactionReceipt({ hash: approvalHash });
      }
      setStatus(t("P000217"));
      const depositHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "deposit",
        args: [value],
      });
      await client.waitForTransactionReceipt({ hash: depositHash });
      setStatus(t("P000218"));
      const confirmed = await waitForEscrowCredit(previous);
      onConfirmed(confirmed);
      setStatus(t("P000219", { 0: formatUnits(value, 18) }));
    } catch (reason) {
      setStatus(
        reason instanceof Error && reason.message === "INVALID_AMOUNT"
          ? t("P000215")
          : t("P000221"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-[var(--border)] p-4">
      <label
        className="grid gap-2 text-sm font-semibold"
        htmlFor="deposit-amount"
      >
        {t("P000234")}
        <input
          className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"
          id="deposit-amount"
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          value={amount}
        />
      </label>
      <Button
        disabled={disabled || !tokenAddress || !escrowAddress}
        icon={<ArrowDownToLine aria-hidden="true" />}
        loading={pending}
        loadingText={t("P000220")}
        onClick={() => void deposit()}
      >
        {t("P000214")}
      </Button>
      {status ? (
        <p className="m-0 text-sm text-[var(--muted)]" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
