CREATE OR REPLACE FUNCTION reset_ledger_for_test()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF RIGHT(current_database(), 5) <> '_test' THEN
    RAISE EXCEPTION 'TEST_RESET_FORBIDDEN';
  END IF;

  TRUNCATE TABLE "ChainDepositEvent", "LedgerEntry", "LedgerTransaction", "LedgerAccount"
    RESTART IDENTITY;
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION reset_ledger_for_test() FROM PUBLIC;
