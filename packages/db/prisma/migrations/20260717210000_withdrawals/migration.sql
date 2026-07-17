CREATE TABLE "WalletWithdrawalNonce" (
  "chainId" BIGINT NOT NULL,
  "escrowAddress" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "nextNonce" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletWithdrawalNonce_pkey" PRIMARY KEY ("chainId", "escrowAddress", "walletAddress")
);

CREATE TABLE "Withdrawal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "chainId" BIGINT NOT NULL,
  "escrowAddress" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "nonce" BIGINT NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "signature" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "idempotencyKey" TEXT,
  "reservationTransactionId" TEXT NOT NULL,
  "settlementTransactionId" TEXT,
  "chainTransactionHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Withdrawal_reservationTransactionId_key" ON "Withdrawal"("reservationTransactionId");
CREATE UNIQUE INDEX "Withdrawal_settlementTransactionId_key" ON "Withdrawal"("settlementTransactionId");
CREATE UNIQUE INDEX "Withdrawal_chainId_escrowAddress_walletAddress_nonce_key" ON "Withdrawal"("chainId", "escrowAddress", "walletAddress", "nonce");
CREATE UNIQUE INDEX "Withdrawal_userId_idempotencyKey_key" ON "Withdrawal"("userId", "idempotencyKey");
CREATE INDEX "Withdrawal_status_deadline_idx" ON "Withdrawal"("status", "deadline");
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_reservationTransactionId_fkey" FOREIGN KEY ("reservationTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_settlementTransactionId_fkey" FOREIGN KEY ("settlementTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reset_ledger_for_test()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF RIGHT(current_database(), 5) <> '_test' THEN
    RAISE EXCEPTION 'TEST_RESET_FORBIDDEN';
  END IF;

  TRUNCATE TABLE "Withdrawal", "WalletWithdrawalNonce", "ChainDepositEvent", "LedgerEntry", "LedgerTransaction", "LedgerAccount"
    RESTART IDENTITY;
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION reset_ledger_for_test() FROM PUBLIC;
