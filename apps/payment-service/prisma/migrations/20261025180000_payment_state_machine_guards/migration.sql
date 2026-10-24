-- State machines and ledger consistency enforced by the database, mirroring the domain
-- (PAYMENT_STATUS_TRANSITIONS, TRANSACTION_STATUS_TRANSITIONS, Payment invariants).

-- ---------------------------------------------------------------------------
-- payment_transactions: initial status and final rows
-- ---------------------------------------------------------------------------

-- A refund is recorded once the gateway confirmed it: it is always SUCCESS.
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_refund_is_success" CHECK ("type" <> 'REFUND' OR "status" = 'SUCCESS'),
  -- A final entry always carries the gateway reconciliation id.
  ADD CONSTRAINT "payment_transactions_final_has_gateway_tx_id" CHECK ("status" = 'PENDING' OR "gateway_tx_id" IS NOT NULL);

-- A charge starts PENDING, without gateway id.
CREATE FUNCTION "payment_transactions_insert_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" = 'CHARGE' AND (NEW."status" <> 'PENDING' OR NEW."gateway_tx_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'payment_transactions %: a CHARGE is created PENDING without gateway id', NEW."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payment_transactions_insert_guard"
  BEFORE INSERT ON "payment_transactions"
  FOR EACH ROW EXECUTE FUNCTION "payment_transactions_insert_guard"();

-- ---------------------------------------------------------------------------
-- payments: state machine, immutable columns, monotonic refunds and version, no deletion
-- ---------------------------------------------------------------------------

CREATE FUNCTION "payment_status_transition_allowed"("from_status" "payment_status", "to_status" "payment_status")
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT ("from_status", "to_status") IN (
    ('PENDING'::"payment_status", 'PAID'::"payment_status"),
    ('PENDING', 'FAILED'),
    ('PAID', 'PARTIALLY_REFUNDED'),
    ('PAID', 'REFUNDED'),
    ('PARTIALLY_REFUNDED', 'PARTIALLY_REFUNDED'),
    ('PARTIALLY_REFUNDED', 'REFUNDED')
  );
$$;

CREATE FUNCTION "payments_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments % cannot be deleted (financial record)', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' OR NEW."refunded_amount" <> 0 THEN
      RAISE EXCEPTION 'payments %: a payment is created PENDING with nothing refunded', NEW."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."status" <> OLD."status" AND NOT "payment_status_transition_allowed"(OLD."status", NEW."status") THEN
    RAISE EXCEPTION 'payments %: status transition % -> % is not allowed', OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW."id", NEW."order_id", NEW."customer_id", NEW."total_amount", NEW."currency", NEW."line_items", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."order_id", OLD."customer_id", OLD."total_amount", OLD."currency", OLD."line_items", OLD."created_at") THEN
    RAISE EXCEPTION 'payments %: identity, order, amount owed and lines are immutable', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."refunded_amount" < OLD."refunded_amount" THEN
    RAISE EXCEPTION 'payments %: refunded_amount cannot decrease (% -> %)', OLD."id", OLD."refunded_amount", NEW."refunded_amount"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."version" <= OLD."version" THEN
    RAISE EXCEPTION 'payments %: every update must increment version (optimistic locking)', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payments_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "payments_guard"();

-- ---------------------------------------------------------------------------
-- Payment ↔ ledger consistency, checked at COMMIT (deferred): the status and refunded amount of a
-- payment must match its ledger after every transaction, whatever wrote it.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "assert_payment_ledger_consistency"("checked_payment_id" uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  "payment" "payments"%ROWTYPE;
  "paid" numeric;
  "refunded" numeric;
  "open_or_paid_charges" integer;
  "failed_charges" integer;
  "is_consistent" boolean;
BEGIN
  SELECT * INTO "payment" FROM "payments" WHERE "id" = "checked_payment_id";
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT
    COALESCE(SUM("amount") FILTER (WHERE "type" = 'CHARGE' AND "status" = 'SUCCESS'), 0),
    COALESCE(SUM("amount") FILTER (WHERE "type" = 'REFUND' AND "status" = 'SUCCESS'), 0),
    COUNT(*) FILTER (WHERE "type" = 'CHARGE' AND "status" IN ('PENDING', 'SUCCESS')),
    COUNT(*) FILTER (WHERE "type" = 'CHARGE' AND "status" IN ('FAILED', 'CANCELLED'))
  INTO "paid", "refunded", "open_or_paid_charges", "failed_charges"
  FROM "payment_transactions" WHERE "payment_id" = "checked_payment_id";
  "is_consistent" := "payment"."refunded_amount" = "refunded" AND "open_or_paid_charges" <= 1 AND CASE "payment"."status"
    WHEN 'PENDING' THEN "paid" < "payment"."total_amount" AND "refunded" = 0
    WHEN 'PAID' THEN "paid" >= "payment"."total_amount" AND "refunded" = 0
    WHEN 'PARTIALLY_REFUNDED' THEN "paid" >= "payment"."total_amount" AND "refunded" > 0 AND "refunded" < "payment"."total_amount"
    WHEN 'REFUNDED' THEN "paid" >= "payment"."total_amount" AND "refunded" = "payment"."total_amount"
    WHEN 'FAILED' THEN "paid" = 0 AND "refunded" = 0 AND "failed_charges" > 0
  END;
  IF NOT "is_consistent" THEN
    RAISE EXCEPTION 'payments %: status % / refunded % do not match the ledger (charged %, refunded %, open or paid charges %)',
      "checked_payment_id", "payment"."status", "payment"."refunded_amount", "paid", "refunded", "open_or_paid_charges"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END;
$$;

CREATE FUNCTION "payments_consistency_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "assert_payment_ledger_consistency"(NEW."id");
  RETURN NULL;
END;
$$;

CREATE FUNCTION "payment_transactions_consistency_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "assert_payment_ledger_consistency"(NEW."payment_id");
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "payments_ledger_consistency"
  AFTER INSERT OR UPDATE ON "payments"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "payments_consistency_check"();

CREATE CONSTRAINT TRIGGER "payment_transactions_ledger_consistency"
  AFTER INSERT OR UPDATE ON "payment_transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "payment_transactions_consistency_check"();
