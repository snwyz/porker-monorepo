ALTER TABLE "User" ADD COLUMN "walletAddress" TEXT;

CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

CREATE TABLE "WalletNonce" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletNonce_nonceHash_key" ON "WalletNonce"("nonceHash");
CREATE INDEX "WalletNonce_address_expiresAt_idx" ON "WalletNonce"("address", "expiresAt");

ALTER TABLE "WalletNonce" ADD CONSTRAINT "WalletNonce_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
