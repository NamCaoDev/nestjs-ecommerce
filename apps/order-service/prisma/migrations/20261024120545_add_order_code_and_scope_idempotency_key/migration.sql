-- DropIndex
DROP INDEX "orders_idempotency_key_key";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_code" VARCHAR(32) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_customer_id_idempotency_key_key" ON "orders"("customer_id", "idempotency_key");

