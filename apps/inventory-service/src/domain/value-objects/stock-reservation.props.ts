import { ReservationLine } from './reservation-line.type';

/**
 * Attributes of a {@link StockReservation}.
 */
export interface StockReservationProps {
  /** Key identifying the reservation across retries (customer-scoped Idempotency-Key). */
  readonly reservationKey: string;
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** SKUs and quantities, each SKU at most once. */
  readonly items: readonly ReservationLine[];
}
