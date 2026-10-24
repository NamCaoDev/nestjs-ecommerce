import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { StockCachePort } from '../../ports/stock-cache.port';
import { STOCK_CACHE_PORT } from '../../ports/stock-cache.token';
import { StockCounters } from '../../ports/stock-counters.type';
import type { StockReadPort } from '../../ports/stock-read.port';
import { STOCK_READ_PORT } from '../../ports/stock-read.token';
import { StockLevelReadModel } from '../../read-models/stock-level.read-model';
import { GetStockBySkuQuery } from './get-stock-by-sku.query';

/**
 * Reads a SKU's stock from the Redis hot path. When Redis has no entry (e.g. after a data loss),
 * reads PostgreSQL and restores the Redis counters so reservations work again.
 */
@QueryHandler(GetStockBySkuQuery)
export class GetStockBySkuHandler implements IQueryHandler<
  GetStockBySkuQuery,
  StockLevelReadModel | undefined
> {
  /**
   * @param stockCache - Redis counters.
   * @param stockRead - PostgreSQL stock tables.
   */
  public constructor(
    @Inject(STOCK_CACHE_PORT) private readonly stockCache: StockCachePort,
    @Inject(STOCK_READ_PORT) private readonly stockRead: StockReadPort,
  ) {}

  /**
   * @param query - SKU identifier.
   * @returns The stock level, or `undefined` for an unknown SKU.
   */
  public async execute(
    query: GetStockBySkuQuery,
  ): Promise<StockLevelReadModel | undefined> {
    const cachedCounters: StockCounters | undefined =
      await this.stockCache.findCounters(query.skuId);
    if (cachedCounters !== undefined) {
      return GetStockBySkuHandler.toReadModel({
        counters: cachedCounters,
        source: 'REDIS',
      });
    }
    const storedCounters: StockCounters | undefined =
      await this.stockRead.findCounters(query.skuId);
    if (storedCounters === undefined) {
      return undefined;
    }
    await this.stockCache.saveCountersIfAbsent(storedCounters);
    return GetStockBySkuHandler.toReadModel({
      counters: storedCounters,
      source: 'DATABASE',
    });
  }

  /**
   * @returns The read model with the available quantity.
   */
  private static toReadModel({
    counters,
    source,
  }: {
    readonly counters: StockCounters;
    readonly source: StockLevelReadModel['source'];
  }): StockLevelReadModel {
    return {
      ...counters,
      availableQuantity: counters.totalQuantity - counters.reservedQuantity,
      source,
    };
  }
}
