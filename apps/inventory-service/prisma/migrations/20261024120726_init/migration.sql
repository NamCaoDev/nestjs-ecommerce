-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "stock_action_type" AS ENUM ('RESERVED', 'RELEASED', 'COMMITTED');

-- CreateTable
CREATE TABLE "inventory_stocks" (
    "sku_id" UUID NOT NULL,
    "total_quantity" INTEGER NOT NULL,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_stocks_pkey" PRIMARY KEY ("sku_id")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "quantity_changed" INTEGER NOT NULL,
    "action_type" "stock_action_type" NOT NULL,
    "order_id" UUID NOT NULL,
    "reservation_key" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_ledger_sku_id_created_at_idx" ON "stock_ledger"("sku_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_ledger_order_id_idx" ON "stock_ledger"("order_id");

-- CreateIndex
CREATE INDEX "stock_ledger_reservation_key_idx" ON "stock_ledger"("reservation_key");

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "inventory_stocks"("sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariants Prisma cannot model: stock counters stay within bounds.
ALTER TABLE "inventory_stocks"
  ADD CONSTRAINT "inventory_stocks_quantities_check"
  CHECK ("total_quantity" >= 0 AND "reserved_quantity" >= 0 AND "reserved_quantity" <= "total_quantity");
