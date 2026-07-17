CREATE TABLE "ChainCheckpointHistory" (
    "chainId" BIGINT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainCheckpointHistory_pkey" PRIMARY KEY ("chainId", "blockNumber")
);

CREATE INDEX "ChainCheckpointHistory_chainId_blockNumber_idx"
ON "ChainCheckpointHistory"("chainId", "blockNumber" DESC);
