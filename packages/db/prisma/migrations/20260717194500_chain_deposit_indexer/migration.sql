-- CreateTable
CREATE TABLE "ChainCheckpoint" (
    "chainId" BIGINT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainCheckpoint_pkey" PRIMARY KEY ("chainId")
);

-- CreateTable
CREATE TABLE "ChainDepositEvent" (
    "id" TEXT NOT NULL,
    "chainId" BIGINT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "userId" TEXT,
    "ledgerTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainDepositEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChainDepositEvent_ledgerTransactionId_key" ON "ChainDepositEvent"("ledgerTransactionId");
CREATE UNIQUE INDEX "ChainDepositEvent_chainId_transactionHash_logIndex_key" ON "ChainDepositEvent"("chainId", "transactionHash", "logIndex");
CREATE INDEX "ChainDepositEvent_chainId_blockNumber_idx" ON "ChainDepositEvent"("chainId", "blockNumber");
CREATE INDEX "ChainDepositEvent_walletAddress_idx" ON "ChainDepositEvent"("walletAddress");

ALTER TABLE "ChainDepositEvent" ADD CONSTRAINT "ChainDepositEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChainDepositEvent" ADD CONSTRAINT "ChainDepositEvent_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
