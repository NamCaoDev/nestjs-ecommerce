import { StockLedgerEntryReadModel } from '../read-models/stock-ledger-entry.read-model';
import { FindLedgerInput } from './find-ledger.input';
import { StockCounters } from './stock-counters.type';

/**
 * Query-side access to the durable stock tables (PostgreSQL). Injected with {@link STOCK_READ_PORT}.
 */
export interface StockReadPort {
  /**
   * @param skuId - SKU UUID.
   * @returns The stored counters, or `undefined` for an unknown SKU.
   */
  findCounters(skuId: string): Promise<StockCounters | undefined>;

  /**
   * @param input - SKU and maximum number of entries.
   * @returns The most recent ledger entries, newest first.
   */
  findLedger(input: FindLedgerInput): Promise<StockLedgerEntryReadModel[]>;
}
