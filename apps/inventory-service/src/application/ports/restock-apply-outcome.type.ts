/**
 * Result of {@link StockCachePort.applyRestock}:
 * `APPLIED`, `ALREADY_APPLIED` (redelivered event), or `SKU_NOT_CACHED` (nothing to update: the next
 * restore from PostgreSQL already includes the receipt).
 */
export type RestockApplyOutcome =
  'APPLIED' | 'ALREADY_APPLIED' | 'SKU_NOT_CACHED';
