import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { readBooleanEnv } from '@org/shared-infrastructure';
import { WarmUpStockCacheCommand } from '../../application/commands/warm-up-stock-cache/warm-up-stock-cache.command';
import { WarmUpStockCacheOutput } from '../../application/commands/warm-up-stock-cache/warm-up-stock-cache.output';

/** SKUs read from PostgreSQL per page. */
const WARMUP_BATCH_SIZE = 500;

/**
 * Restores every SKU missing in Redis from PostgreSQL at startup (`STOCK_CACHE_WARMUP_ENABLED`,
 * default true), so the first checkouts after a Redis loss do not all take the cold-cache fallback.
 * A failure is logged and does not stop the service: reservations still self-heal per SKU.
 */
@Injectable()
export class StockCacheWarmupService implements OnApplicationBootstrap {
  private readonly logger: Logger = new Logger(StockCacheWarmupService.name);

  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {}

  /**
   * Runs the warm-up once.
   */
  public async onApplicationBootstrap(): Promise<void> {
    if (
      !readBooleanEnv({
        name: 'STOCK_CACHE_WARMUP_ENABLED',
        defaultValue: true,
      })
    ) {
      this.logger.log('Disabled by STOCK_CACHE_WARMUP_ENABLED');
      return;
    }
    try {
      const output: WarmUpStockCacheOutput = await this.commandBus.execute(
        new WarmUpStockCacheCommand({ batchSize: WARMUP_BATCH_SIZE }),
      );
      this.logger.log(
        `Stock cache warm-up: ${output.restoredCount}/${output.scannedCount} SKU(s) restored from PostgreSQL`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Stock cache warm-up failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
