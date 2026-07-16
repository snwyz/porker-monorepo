-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "gameType" TEXT NOT NULL DEFAULT 'CASH',
    "seatCount" INTEGER NOT NULL DEFAULT 9,
    "smallBlind" BIGINT NOT NULL,
    "bigBlind" BIGINT NOT NULL,
    "minBuyIn" BIGINT NOT NULL,
    "maxBuyIn" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT,
    "seatNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "stack" BIGINT NOT NULL DEFAULT 0,
    "buyIn" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hand" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "handNumber" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "pot" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Hand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandEvent" (
    "id" BIGSERIAL NOT NULL,
    "handId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "handId" TEXT,
    "version" BIGINT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" BIGSERIAL NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Seat_userId_idx" ON "Seat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_roomId_seatNumber_key" ON "Seat"("roomId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_roomId_userId_key" ON "Seat"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Hand_roomId_handNumber_key" ON "Hand"("roomId", "handNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HandEvent_handId_sequence_key" ON "HandEvent"("handId", "sequence");

-- CreateIndex
CREATE INDEX "GameSnapshot_handId_idx" ON "GameSnapshot"("handId");

-- CreateIndex
CREATE UNIQUE INDEX "GameSnapshot_roomId_version_key" ON "GameSnapshot"("roomId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_reference_key" ON "LedgerTransaction"("reference");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hand" ADD CONSTRAINT "Hand_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandEvent" ADD CONSTRAINT "HandEvent_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSnapshot" ADD CONSTRAINT "GameSnapshot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSnapshot" ADD CONSTRAINT "GameSnapshot_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Global room constraints.
ALTER TABLE "Room"
  ADD CONSTRAINT "Room_visibility_check" CHECK ("visibility" = 'PUBLIC'),
  ADD CONSTRAINT "Room_gameType_check" CHECK ("gameType" = 'CASH'),
  ADD CONSTRAINT "Room_seatCount_check" CHECK ("seatCount" BETWEEN 2 AND 9);

CREATE FUNCTION enforce_seat_within_room_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  configured_seat_count INTEGER;
BEGIN
  SELECT "seatCount"
    INTO configured_seat_count
    FROM "Room"
   WHERE "id" = NEW."roomId"
   FOR UPDATE;

  IF NEW."seatNumber" < 0 OR NEW."seatNumber" >= configured_seat_count THEN
    RAISE EXCEPTION 'SEAT_INDEX_OUT_OF_RANGE'
      USING ERRCODE = '23514', CONSTRAINT = 'Seat_seatNumber_capacity_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Seat_capacity_guard"
BEFORE INSERT OR UPDATE OF "roomId", "seatNumber" ON "Seat"
FOR EACH ROW
EXECUTE FUNCTION enforce_seat_within_room_capacity();

CREATE FUNCTION prevent_room_capacity_below_existing_seat()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."seatCount" <> OLD."seatCount" AND EXISTS (
    SELECT 1
      FROM "Seat"
     WHERE "roomId" = OLD."id"
       AND "seatNumber" >= NEW."seatCount"
  ) THEN
    RAISE EXCEPTION 'ROOM_CAPACITY_BELOW_EXISTING_SEAT'
      USING ERRCODE = '23514', CONSTRAINT = 'Room_existing_seat_capacity_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Room_existing_seat_capacity_guard"
BEFORE UPDATE OF "seatCount" ON "Room"
FOR EACH ROW
EXECUTE FUNCTION prevent_room_capacity_below_existing_seat();

-- Ledger transactions are built while unfinalized, then sealed exactly once.
CREATE FUNCTION guard_ledger_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."reference" IS DISTINCT FROM NEW."reference"
     OR OLD."payloadHash" IS DISTINCT FROM NEW."payloadHash"
     OR OLD."finalizedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'POSTED_LEDGER_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LedgerTransaction_immutable"
BEFORE UPDATE ON "LedgerTransaction"
FOR EACH ROW
EXECUTE FUNCTION guard_ledger_transaction_mutation();

CREATE FUNCTION guard_ledger_entry_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_finalized_at TIMESTAMP(3);
BEGIN
  SELECT "finalizedAt"
    INTO transaction_finalized_at
    FROM "LedgerTransaction"
   WHERE "id" = NEW."transactionId";

  IF transaction_finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'POSTED_LEDGER_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LedgerEntry_insert_guard"
BEFORE INSERT ON "LedgerEntry"
FOR EACH ROW
EXECUTE FUNCTION guard_ledger_entry_insert();

CREATE FUNCTION reject_posted_ledger_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'POSTED_LEDGER_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "LedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW
EXECUTE FUNCTION reject_posted_ledger_entry_mutation();

-- Deferred validation sees the final state assembled by the whole SQL transaction.
CREATE FUNCTION enforce_finalized_ledger_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_finalized_at TIMESTAMP(3);
  entry_count BIGINT;
  transaction_total NUMERIC;
BEGIN
  SELECT "finalizedAt"
    INTO transaction_finalized_at
    FROM "LedgerTransaction"
   WHERE "id" = NEW."id";

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF transaction_finalized_at IS NULL THEN
    RAISE EXCEPTION 'LEDGER_TRANSACTION_NOT_FINALIZED'
      USING ERRCODE = '23514', CONSTRAINT = 'LedgerTransaction_finalized_check';
  END IF;

  SELECT COUNT(*), COALESCE(SUM("amount"), 0)
    INTO entry_count, transaction_total
    FROM "LedgerEntry"
   WHERE "transactionId" = NEW."id";

  IF entry_count < 2 OR transaction_total <> 0 THEN
    RAISE EXCEPTION 'UNBALANCED_LEDGER_TRANSACTION'
      USING ERRCODE = '23514', CONSTRAINT = 'LedgerTransaction_balance_check';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LedgerTransaction_finalize_guard"
AFTER INSERT OR UPDATE ON "LedgerTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_finalized_ledger_transaction();

-- Owner-only deterministic cleanup for disposable *_test databases.
CREATE FUNCTION reset_ledger_for_test()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF RIGHT(current_database(), 5) <> '_test' THEN
    RAISE EXCEPTION 'TEST_RESET_FORBIDDEN';
  END IF;

  TRUNCATE TABLE "LedgerEntry", "LedgerTransaction", "LedgerAccount"
    RESTART IDENTITY;
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION reset_ledger_for_test() FROM PUBLIC;
