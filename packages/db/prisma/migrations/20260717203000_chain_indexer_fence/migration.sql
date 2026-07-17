CREATE TABLE "ChainIndexerLease" (
    "chainId" BIGINT NOT NULL,
    "generation" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainIndexerLease_pkey" PRIMARY KEY ("chainId")
);
