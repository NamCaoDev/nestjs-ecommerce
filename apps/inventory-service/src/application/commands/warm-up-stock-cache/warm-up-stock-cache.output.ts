/**
 * Outcome of a full cache warm-up.
 */
export interface WarmUpStockCacheOutput {
  /** SKUs read from PostgreSQL. */
  readonly scannedCount: number;
  /** SKUs that were missing in Redis and restored. */
  readonly restoredCount: number;
}
