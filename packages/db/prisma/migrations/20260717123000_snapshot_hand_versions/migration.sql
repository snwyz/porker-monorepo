DROP INDEX "GameSnapshot_roomId_version_key";
CREATE UNIQUE INDEX "GameSnapshot_handId_version_key" ON "GameSnapshot"("handId", "version");
CREATE INDEX "GameSnapshot_roomId_createdAt_idx" ON "GameSnapshot"("roomId", "createdAt");
