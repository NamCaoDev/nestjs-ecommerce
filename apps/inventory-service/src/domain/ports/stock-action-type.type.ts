/**
 * Kind of stock movement recorded in the ledger. `EXPIRED_RELEASE` is a release performed by the
 * sweeper because the reservation was never committed in time.
 */
export type StockActionType =
  'RESERVED' | 'RELEASED' | 'COMMITTED' | 'EXPIRED_RELEASE';
