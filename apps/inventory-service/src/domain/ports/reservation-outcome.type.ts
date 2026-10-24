/**
 * Result of an atomic reservation attempt:
 * `RESERVED` (new reservation), `ALREADY_RESERVED` (idempotent replay), `INSUFFICIENT_STOCK`.
 */
export type ReservationOutcome =
  'RESERVED' | 'ALREADY_RESERVED' | 'INSUFFICIENT_STOCK';
