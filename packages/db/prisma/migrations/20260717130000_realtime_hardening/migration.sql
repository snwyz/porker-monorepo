ALTER TABLE "Hand" ADD COLUMN "actionDeadlineAt" TIMESTAMP(3);
ALTER TABLE "HandEvent"
  ADD COLUMN "actionRoomId" TEXT,
  ADD COLUMN "actionPayloadHash" TEXT;
UPDATE "HandEvent" AS event SET "actionRoomId" = hand."roomId" FROM "Hand" AS hand WHERE event."handId" = hand."id" AND event."actionId" IS NOT NULL;
DELETE FROM "GameSnapshot" WHERE "handId" IS NULL;
ALTER TABLE "GameSnapshot" DROP CONSTRAINT "GameSnapshot_handId_fkey";
ALTER TABLE "GameSnapshot" ALTER COLUMN "handId" SET NOT NULL;
ALTER TABLE "GameSnapshot" ADD CONSTRAINT "GameSnapshot_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DisconnectGrace" (
  "id" BIGSERIAL PRIMARY KEY,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DisconnectGrace_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DisconnectGrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DisconnectGrace_roomId_userId_key" ON "DisconnectGrace"("roomId", "userId");
CREATE INDEX "DisconnectGrace_deadlineAt_idx" ON "DisconnectGrace"("deadlineAt");
