import { ReservationLine } from '../../domain/value-objects/reservation-line.type';

/**
 * Data of a reserve or release command, as received from the order service.
 */
export interface StockCommandProps {
  /** Customer-scoped Idempotency-Key identifying the reservation. */
  readonly reservationKey: string;
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  readonly items: readonly ReservationLine[];
}
