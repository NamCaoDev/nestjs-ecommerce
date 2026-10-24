import { StockLedgerEntryReadModel } from '../read-models/stock-ledger-entry.read-model';
import { FindCountersPageInput } from './find-counters-page.input';
import { FindLedgerInput } from './find-ledger.input';
import { StockSnapshot } from './stock-snapshot.type';

/**
 * Query-side access to the durable stock tables (PostgreSQL). Injected with {@link STOCK_READ_PORT}.
 */
export interface StockReadPort {
  /**
   * @param skuId - SKU UUID.
   * @returns The stored snapshot, or `undefined` for an unknown SKU.
   */
  findCounters(skuId: string): Promise<StockSnapshot | undefined>;

  /**
   * @param input - SKU and maximum number of entries.
   * @returns The most recent ledger entries, newest first.
   */
  findLedger(input: FindLedgerInput): Promise<StockLedgerEntryReadModel[]>;

  /**
   * @param skuIds - SKU UUIDs.
   * @returns The stored snapshots of the SKUs that exist.
   */
  findCountersBySkuIds(skuIds: readonly string[]): Promise<StockSnapshot[]>;

  /**
   * @param input - Keyset position and page size.
   * @returns One page of snapshots ordered by SKU id.
   */
  findCountersPage(input: FindCountersPageInput): Promise<StockSnapshot[]>;
}
