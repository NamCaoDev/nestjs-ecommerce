-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_gateway_provider" AS ENUM ('VNPAY', 'VIETQR_VA', 'MOMO', 'ZALOPAY', 'STRIPE', 'MOCK');

-- CreateEnum
CREATE TYPE "payment_channel" AS ENUM ('QR_CODE', 'DOMESTIC_BANK', 'INTERNATIONAL_CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "payment_actor_type" AS ENUM ('SYSTEM', 'GATEWAY', 'CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "total_amount" DECIMAL(19,4) NOT NULL,
    "refunded_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "line_items" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL DEFAULT 'CHARGE',
    "gateway" "payment_gateway_provider" NOT NULL,
    "channel" "payment_channel" NOT NULL DEFAULT 'QR_CODE',
    "gateway_tx_id" VARCHAR(128),
    "amount" DECIMAL(19,4) NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'PENDING',
    "failure_reason" VARCHAR(500),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "raw_gateway_response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_audit_logs" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "transaction_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "actor_type" "payment_actor_type" NOT NULL,
    "actor_id" VARCHAR(128),
    "state_from" VARCHAR(32),
    "state_to" VARCHAR(32),
    "payload" JSONB,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(64) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "locked_until" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_customer_id_created_at_idx" ON "payments"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_transactions_gateway_tx_id_idx" ON "payment_transactions"("gateway_tx_id");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_id_created_at_idx" ON "payment_transactions"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_audit_logs_payment_id_created_at_idx" ON "payment_audit_logs"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_occurred_at_idx" ON "outbox_events"("status", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_id_idx" ON "outbox_events"("aggregate_id");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hard invariants enforced by the database, whatever the client (application, psql, migration).
-- ---------------------------------------------------------------------------

-- Money: the total is positive and the refunds never exceed it.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_total_amount_positive" CHECK ("total_amount" > 0),
  ADD CONSTRAINT "payments_refunded_amount_range" CHECK ("refunded_amount" >= 0 AND "refunded_amount" <= "total_amount");

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_amount_positive" CHECK ("amount" > 0);

-- Ledger: a finalised entry (SUCCESS, FAILED, CANCELLED) can be neither updated nor deleted. A PENDING
-- entry can only be finalised: its identity, payment, type, gateway, amount and key never change.
CREATE FUNCTION "payment_transactions_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" IN ('SUCCESS', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'payment_transactions % is % and immutable (append-only ledger)', OLD."id", OLD."status"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment_transactions % cannot be deleted (append-only ledger)', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (NEW."id", NEW."payment_id", NEW."type", NEW."gateway", NEW."amount", NEW."idempotency_key", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."payment_id", OLD."type", OLD."gateway", OLD."amount", OLD."idempotency_key", OLD."created_at") THEN
    RAISE EXCEPTION 'payment_transactions %: only the outcome of a PENDING entry can change', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payment_transactions_guard"
  BEFORE UPDATE OR DELETE ON "payment_transactions"
  FOR EACH ROW EXECUTE FUNCTION "payment_transactions_guard"();

-- Audit log: append-only, no exception.
CREATE FUNCTION "payment_audit_logs_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment_audit_logs is append-only: % is forbidden', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "payment_audit_logs_guard"
  BEFORE UPDATE OR DELETE ON "payment_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "payment_audit_logs_guard"();

-- TRUNCATE bypasses row triggers: forbid it on both append-only tables.
CREATE FUNCTION "append_only_truncate_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: TRUNCATE is forbidden', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "payment_transactions_no_truncate"
  BEFORE TRUNCATE ON "payment_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION "append_only_truncate_guard"();

CREATE TRIGGER "payment_audit_logs_no_truncate"
  BEFORE TRUNCATE ON "payment_audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "append_only_truncate_guard"();
