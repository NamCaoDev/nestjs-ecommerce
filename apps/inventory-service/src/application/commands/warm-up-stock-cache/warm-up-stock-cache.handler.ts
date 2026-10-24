import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { StockCachePort } from '../../ports/stock-cache.port';
import { STOCK_CACHE_PORT } from '../../ports/stock-cache.token';
import { StockSnapshot } from '../../ports/stock-snapshot.type';
import type { StockReadPort } from '../../ports/stock-read.port';
import { STOCK_READ_PORT } from '../../ports/stock-read.token';
import { WarmUpStockCacheCommand } from './warm-up-stock-cache.command';
import { WarmUpStockCacheOutput } from './warm-up-stock-cache.output';

/**
 * Pages through every stocked SKU (keyset by SKU id) and restores the ones missing in Redis.
 * Existing Redis entries are never overwritten, so it is safe while the service takes traffic.
 */
@CommandHandler(WarmUpStockCacheCommand)
export class WarmUpStockCacheHandler implements ICommandHandler<
  WarmUpStockCacheCommand,
  WarmUpStockCacheOutput
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
   * @param command - Page size.
   * @returns How many SKUs were scanned and restored.
   */
  public async execute(
    command: WarmUpStockCacheCommand,
  ): Promise<WarmUpStockCacheOutput> {
    return this.executePage({
      batchSize: command.batchSize,
      afterSkuId: undefined,
      totals: { scannedCount: 0, restoredCount: 0 },
    });
  }

  /**
   * Restores one page, then continues after its last SKU until a page comes back short.
   */
  private async executePage({
    batchSize,
    afterSkuId,
    totals,
  }: {
    readonly batchSize: number;
    readonly afterSkuId: string | undefined;
    readonly totals: WarmUpStockCacheOutput;
  }): Promise<WarmUpStockCacheOutput> {
    const page: StockSnapshot[] = await this.stockRead.findCountersPage({
      afterSkuId,
      limit: batchSize,
    });
    const restoredCount: number =
      page.length === 0
        ? 0
        : await this.stockCache.saveManyCountersIfAbsent(page);
    const nextTotals: WarmUpStockCacheOutput = {
      scannedCount: totals.scannedCount + page.length,
      restoredCount: totals.restoredCount + restoredCount,
    };
    if (page.length < batchSize) {
      return nextTotals;
    }
    return this.executePage({
      batchSize,
      afterSkuId: page[page.length - 1].skuId,
      totals: nextTotals,
    });
  }
}
