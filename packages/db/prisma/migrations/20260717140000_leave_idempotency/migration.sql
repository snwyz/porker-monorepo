CREATE TABLE "TableOperation" (
  "actionId" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "ack" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TableOperation_roomId_userId_idx" ON "TableOperation"("roomId", "userId");

UPDATE "Room" SET "status" = 'DRAINING'
WHERE "id" IN (
  SELECT "roomId" FROM "GameSnapshot"
  WHERE "state" ? 'deck' OR "state" ? 'holeCards'
);
DELETE FROM "GameSnapshot" WHERE "state" ? 'deck' OR "state" ? 'holeCards';
