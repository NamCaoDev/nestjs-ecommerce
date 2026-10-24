import { Command } from '@nestjs/cqrs';
import { WarmUpStockCacheOutput } from './warm-up-stock-cache.output';

/**
 * Command restoring every SKU missing in Redis from PostgreSQL. Handled by {@link WarmUpStockCacheHandler}.
 */
export class WarmUpStockCacheCommand extends Command<WarmUpStockCacheOutput> {
  /** SKUs read per page. */
  public readonly batchSize: number;

  /**
   * @param props - Page size.
   */
  public constructor({ batchSize }: { readonly batchSize: number }) {
    super();
    this.batchSize = batchSize;
  }
}
