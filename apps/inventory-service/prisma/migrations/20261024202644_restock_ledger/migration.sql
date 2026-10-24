-- AlterEnum
ALTER TYPE "stock_action_type" ADD VALUE 'RESTOCK';

-- AlterTable
ALTER TABLE "stock_ledger" ADD COLUMN     "idempotency_key" VARCHAR(128),
ADD COLUMN     "reference_note" VARCHAR(500),
ALTER COLUMN "order_id" DROP NOT NULL,
ALTER COLUMN "reservation_key" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "stock_ledger_idempotency_key_key" ON "stock_ledger"("idempotency_key");

