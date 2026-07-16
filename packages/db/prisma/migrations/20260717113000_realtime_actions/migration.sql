ALTER TABLE "HandEvent"
ADD COLUMN "actionId" TEXT,
ADD COLUMN "actorUserId" TEXT,
ADD COLUMN "ack" JSONB;

CREATE UNIQUE INDEX "HandEvent_actionId_key" ON "HandEvent"("actionId");
