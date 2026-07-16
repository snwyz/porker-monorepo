ALTER TABLE "HandEvent" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HandEvent" ALTER COLUMN "version" DROP DEFAULT;
CREATE INDEX "HandEvent_handId_version_idx" ON "HandEvent"("handId", "version");
