import { z } from "zod";

import { formatProblem } from "@/lib/api";

const NonceSchema = z.object({ nonce: z.string(), expiresAt: z.string() });
const IdentitySchema = z.object({ address: z.string() });
const BalanceSchema = z.object({ address: z.string(), escrow: z.string() });
const WithdrawalSchema = z.object({
  id: z.string(),
  account: z.string(),
  amount: z.string(),
  nonce: z.string(),
  deadline: z.string(),
  signature: z.string(),
  status: z.string(),
  chainId: z.number(),
  escrowAddress: z.string(),
  chainTransactionHash: z.string().nullable(),
});

export type Withdrawal = z.infer<typeof WithdrawalSchema>;

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/game${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(formatProblem(body));
  }
  return body;
}

export async function issueWalletNonce(address: string) {
  return NonceSchema.parse(
    await request("/v1/wallet/nonce", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),
  );
}

export async function verifyWallet(message: string, signature: string) {
  return IdentitySchema.parse(
    await request("/v1/wallet/verify", {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    }),
  );
}

export async function getEscrowBalance() {
  return BalanceSchema.parse(await request("/v1/wallet/balance"));
}

export async function requestWithdrawal(amount: bigint) {
  return WithdrawalSchema.parse(
    await request("/v1/withdrawals", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ amount: amount.toString() }),
    }),
  );
}

export async function getWithdrawal(id: string) {
  return WithdrawalSchema.parse(await request(`/v1/withdrawals/${id}`));
}
