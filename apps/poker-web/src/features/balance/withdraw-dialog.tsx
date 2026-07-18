"use client";

import { ArrowUpFromLine } from "lucide-react";
import { useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { escrowAbi } from "@/features/wallet/contracts";
import {
  getEscrowBalance,
  getWithdrawal,
  requestWithdrawal,
} from "@/features/wallet/web3-api";

async function waitForWithdrawal(id: string): Promise<bigint> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const withdrawal = await getWithdrawal(id);
    if (withdrawal.status === "COMPLETED") {
      return BigInt((await getEscrowBalance()).escrow);
    }
    if (withdrawal.status === "RELEASED") throw new Error("VOUCHER_RELEASED");
    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
  }
  throw new Error("WITHDRAWAL_CONFIRMATION_TIMEOUT");
}

export function WithdrawDialog({
  disabled,
  onConfirmed,
}: {
  disabled: boolean;
  onConfirmed: (balance: bigint) => void;
}) {
  const { t } = useI18n();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("5");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  async function withdraw() {
    if (!client) return;
    setPending(true);
    setStatus("");
    try {
      const value = parseUnits(amount, 18);
      if (value <= BigInt(0)) throw new Error("INVALID_AMOUNT");
      setStatus(t("P000223"));
      const voucher = await requestWithdrawal(value);
      setStatus(t("P000224"));
      const hash = await writeContractAsync({
        address: voucher.escrowAddress as Address,
        abi: escrowAbi,
        functionName: "withdraw",
        args: [
          {
            account: voucher.account as Address,
            amount: BigInt(voucher.amount),
            nonce: BigInt(voucher.nonce),
            deadline: BigInt(voucher.deadline),
          },
          voucher.signature as Hex,
        ],
      });
      await client.waitForTransactionReceipt({ hash });
      setStatus(t("P000225"));
      const confirmed = await waitForWithdrawal(voucher.id);
      onConfirmed(confirmed);
      setStatus(t("P000226", { 0: formatUnits(value, 18) }));
    } catch (reason) {
      setStatus(
        reason instanceof Error && reason.message === "INVALID_AMOUNT"
          ? t("P000215")
          : t("P000228"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-[var(--border)] p-4">
      <label
        className="grid gap-2 text-sm font-semibold"
        htmlFor="withdraw-amount"
      >
        {t("P000235")}
        <input
          className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3"
          id="withdraw-amount"
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          value={amount}
        />
      </label>
      <Button
        disabled={disabled}
        icon={<ArrowUpFromLine aria-hidden="true" />}
        loading={pending}
        loadingText={t("P000227")}
        onClick={() => void withdraw()}
        variant="secondary"
      >
        {t("P000222")}
      </Button>
      {status ? (
        <p className="m-0 text-sm text-[var(--muted)]" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
