import { StockCounters } from './stock-counters.type';

/**
 * Durable counters of a SKU read in one consistent snapshot with the `stock.restocked` events that are
 * already included in them but not yet applied to Redis. Restoring Redis from the snapshot must mark
 * those events as applied, otherwise the relay would add them a second time.
 */
export interface StockSnapshot extends StockCounters {
  readonly pendingRestockEventIds: readonly string[];
}
