import { ApplyRestockInput } from './apply-restock.input';
import { RestockApplyOutcome } from './restock-apply-outcome.type';
import { StockCounters } from './stock-counters.type';
import { StockSnapshot } from './stock-snapshot.type';

/**
 * Hot-path stock counters in Redis, which the reservation Lua scripts read and write.
 * Injected with {@link STOCK_CACHE_PORT}.
 */
export interface StockCachePort {
  /**
   * @param skuId - SKU UUID.
   * @returns The counters, or `undefined` when Redis has no entry for the SKU.
   */
  findCounters(skuId: string): Promise<StockCounters | undefined>;

  /**
   * Restores missing counters from a PostgreSQL snapshot. Atomic and only applied while the entry is
   * absent (live counters are never overwritten); marks the snapshot's pending receipts as applied.
   * No expiry, because the reservation scripts rely on the entry.
   *
   * @param snapshot - Counters and pending receipts read from PostgreSQL.
   */
  saveCountersIfAbsent(snapshot: StockSnapshot): Promise<void>;

  /**
   * Same as {@link saveCountersIfAbsent} for many SKUs in one round trip.
   *
   * @param snapshots - Snapshots read from PostgreSQL.
   * @returns How many entries were missing and restored.
   */
  saveManyCountersIfAbsent(
    snapshots: readonly StockSnapshot[],
  ): Promise<number>;

  /**
   * Adds a receipt to the cached total exactly once per event, atomically with its applied marker.
   *
   * @param input - Event id, SKU and units received.
   * @returns What happened.
   */
  applyRestock(input: ApplyRestockInput): Promise<RestockApplyOutcome>;
}
