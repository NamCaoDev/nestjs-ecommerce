/**
 * Outcome of an atomic commit:
 * - `COMMITTED`: the reservation was shipped;
 * - `ALREADY_COMMITTED`: redelivered event, nothing changed;
 * - `REACQUIRED_AND_COMMITTED`: the reservation had expired but the stock was still available and was shipped;
 * - `EXPIRED_AND_OUT_OF_STOCK`: the reservation had expired and the stock is gone; nothing was shipped.
 */
export type CommitOutcome =
  | 'COMMITTED'
  | 'ALREADY_COMMITTED'
  | 'REACQUIRED_AND_COMMITTED'
  | 'EXPIRED_AND_OUT_OF_STOCK';
