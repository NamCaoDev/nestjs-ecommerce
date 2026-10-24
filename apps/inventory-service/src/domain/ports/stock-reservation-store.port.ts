import { StockReservation } from '../value-objects/stock-reservation.vo';
import { CommitResult } from './commit-result.type';
import { ReleaseOutcome } from './release-outcome.type';
import { ReservationOutcome } from './reservation-outcome.type';

/**
 * Hot-path store applying reservations atomically (Redis + Lua, CLAUDE.md §4.1).
 * A reservation is `RESERVED` until it is committed, released, or released by the sweeper on expiry.
 * Injected with {@link STOCK_RESERVATION_STORE_PORT}.
 */
export interface StockReservationStorePort {
  /**
   * Checks and reserves every line at once, or none, and schedules its expiry.
   *
   * @param reservation - Reservation to apply.
   * @returns What happened; a replayed key returns `ALREADY_RESERVED` without reserving twice.
   */
  reserve(reservation: StockReservation): Promise<ReservationOutcome>;

  /**
   * Releases a `RESERVED` reservation and unschedules its expiry. Idempotent.
   *
   * @param reservation - Reservation to undo.
   * @returns `RELEASED`, or `NOT_FOUND` when nothing is held under the key.
   */
  release(reservation: StockReservation): Promise<ReleaseOutcome>;

  /**
   * Ships the stock of a placed order. A `RESERVED` reservation is converted; when it is gone
   * (expired or released) the stock is re-acquired if still available. Idempotent.
   *
   * @param reservation - Reservation key and the lines to ship.
   * @returns What happened and whether the reserved counter was involved.
   */
  commit(reservation: StockReservation): Promise<CommitResult>;

  /**
   * @param orderId - Logical order identifier.
   * @returns The reservation held for the order, as stored, or `undefined` when none exists.
   */
  findByOrderId(orderId: string): Promise<StockReservation | undefined>;

  /**
   * @param limit - Maximum number of reservations to return.
   * @returns Reservations whose expiry time has passed, oldest first.
   */
  findExpired(limit: number): Promise<StockReservation[]>;
}
