CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");

ALTER TABLE "Room"
  ADD COLUMN "actionTimeoutSeconds" INTEGER NOT NULL DEFAULT 30,
  ADD CONSTRAINT "Room_actionTimeoutSeconds_check"
    CHECK ("actionTimeoutSeconds" BETWEEN 10 AND 120),
  ADD CONSTRAINT "Room_blinds_buyins_check"
    CHECK (
      "smallBlind" > 0
      AND "smallBlind" < "bigBlind"
      AND "bigBlind" <= "minBuyIn"
      AND "minBuyIn" <= "maxBuyIn"
    );
