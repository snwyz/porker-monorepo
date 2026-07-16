-- Room shape is intentionally constrained to the globally supported game mode.
ALTER TABLE "Room"
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "gameType" TEXT NOT NULL DEFAULT 'CASH',
  ADD COLUMN "seatCount" INTEGER NOT NULL DEFAULT 9;

ALTER TABLE "Room"
  ADD CONSTRAINT "Room_visibility_check" CHECK ("visibility" = 'PUBLIC'),
  ADD CONSTRAINT "Room_gameType_check" CHECK ("gameType" = 'CASH'),
  ADD CONSTRAINT "Room_seatCount_check" CHECK ("seatCount" BETWEEN 2 AND 9);

CREATE UNIQUE INDEX "Seat_roomId_userId_key" ON "Seat"("roomId", "userId");

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
   WHERE "id" = NEW."roomId";

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

-- Posted entries are append-only. Corrections must be compensating transactions.
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

-- This constraint trigger is deferred until COMMIT so a multi-row posting can be
-- inserted atomically, while an unbalanced direct write still cannot commit.
CREATE FUNCTION enforce_ledger_transaction_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  entry_count BIGINT;
  transaction_total NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(SUM("amount"), 0)
    INTO entry_count, transaction_total
    FROM "LedgerEntry"
   WHERE "transactionId" = NEW."transactionId";

  IF entry_count < 2 OR transaction_total <> 0 THEN
    RAISE EXCEPTION 'UNBALANCED_LEDGER_TRANSACTION'
      USING ERRCODE = '23514', CONSTRAINT = 'LedgerTransaction_balance_check';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LedgerEntry_balance_guard"
AFTER INSERT ON "LedgerEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_ledger_transaction_balance();

-- Tests need deterministic cleanup despite append-only triggers. The function is
-- unavailable to PUBLIC and refuses to operate outside a *_test database.
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
