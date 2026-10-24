/**
 * Result of an atomic reservation attempt:
 * `RESERVED` (new reservation), `ALREADY_RESERVED` (idempotent replay), `INSUFFICIENT_STOCK`, or
 * `STOCK_NOT_LOADED` when a SKU has no counters in the hot-path store (cold cache).
 */
export type ReservationOutcome =
  'RESERVED' | 'ALREADY_RESERVED' | 'INSUFFICIENT_STOCK' | 'STOCK_NOT_LOADED';
