import { HasMovementInput } from './has-movement.input';
import { RecordStockMovementInput } from './record-stock-movement.input';

/**
 * Durable record of stock movements (PostgreSQL). Injected with {@link STOCK_LEDGER_REPOSITORY_PORT}.
 */
export interface StockLedgerRepositoryPort {
  /**
   * Updates the stock counters and appends one ledger entry per line, in one local transaction.
   *
   * @param input - Movement kind and the reservation it applies to.
   */
  recordMovement(input: RecordStockMovementInput): Promise<void>;

  /**
   * @param input - Order and movement kind.
   * @returns `true` when the ledger already holds such a movement for the order.
   */
  hasMovement(input: HasMovementInput): Promise<boolean>;
}
