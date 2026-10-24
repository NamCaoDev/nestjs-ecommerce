import { Inject, Injectable } from '@nestjs/common';
import type { StockCachePort } from '../ports/stock-cache.port';
import { STOCK_CACHE_PORT } from '../ports/stock-cache.token';
import { StockSnapshot } from '../ports/stock-snapshot.type';
import type { StockReadPort } from '../ports/stock-read.port';
import { STOCK_READ_PORT } from '../ports/stock-read.token';

/**
 * Restores missing Redis stock counters from PostgreSQL (cold cache after a Redis loss or flush).
 * Only absent entries are written, so live counters are never overwritten.
 */
@Injectable()
export class StockCacheWarmer {
  /**
   * @param stockCache - Redis counters.
   * @param stockRead - PostgreSQL stock tables.
   */
  public constructor(
    @Inject(STOCK_CACHE_PORT) private readonly stockCache: StockCachePort,
    @Inject(STOCK_READ_PORT) private readonly stockRead: StockReadPort,
  ) {}

  /**
   * @param skuIds - SKUs to restore when missing; unknown SKUs are ignored.
   * @returns How many SKUs were restored.
   */
  public async warmSkus(skuIds: readonly string[]): Promise<number> {
    const storedCounters: StockSnapshot[] =
      await this.stockRead.findCountersBySkuIds([...new Set(skuIds)]);
    if (storedCounters.length === 0) {
      return 0;
    }
    return this.stockCache.saveManyCountersIfAbsent(storedCounters);
  }
}
