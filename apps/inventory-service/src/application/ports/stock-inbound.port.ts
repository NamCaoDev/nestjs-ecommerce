import { Result } from '@org/shared-domain';
import { DuplicateRequestError } from '../errors/duplicate-request.error';
import { SaveRestockInput } from './save-restock.input';
import { StockCounters } from './stock-counters.type';

/**
 * Durable recording of goods received (PostgreSQL). Injected with {@link STOCK_INBOUND_PORT}.
 */
export interface StockInboundPort {
  /**
   * In one local transaction: raises the SKU total (creating the SKU when new) and appends a
   * `RESTOCK` ledger entry.
   *
   * @param input - Validated receipt and its Idempotency-Key.
   * @returns The counters after the receipt, or a {@link DuplicateRequestError} for a reused key.
   */
  saveRestock(
    input: SaveRestockInput,
  ): Promise<Result<StockCounters, DuplicateRequestError>>;
}
