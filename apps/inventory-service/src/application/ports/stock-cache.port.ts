import { StockCounters } from './stock-counters.type';

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
   * Restores missing counters from the durable store. Atomic and only applied while the entry is
   * absent, so it never overwrites live counters; no expiry, because the reservation scripts rely on it.
   *
   * @param counters - Counters read from PostgreSQL.
   */
  saveCountersIfAbsent(counters: StockCounters): Promise<void>;
}
