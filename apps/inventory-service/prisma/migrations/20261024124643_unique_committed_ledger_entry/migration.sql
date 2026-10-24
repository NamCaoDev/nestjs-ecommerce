-- At most one COMMITTED ledger entry per order and SKU, so reconciling the ledger after a
-- redelivered order.placed event can never record a shipment twice.
-- Partial indexes cannot be expressed in schema.prisma, hence this hand-written migration.
CREATE UNIQUE INDEX "stock_ledger_committed_order_sku_key"
  ON "stock_ledger" ("order_id", "sku_id")
  WHERE "action_type" = 'COMMITTED';
