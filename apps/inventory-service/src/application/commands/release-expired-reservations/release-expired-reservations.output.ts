/**
 * Outcome of one sweeper run.
 */
export interface ReleaseExpiredReservationsOutput {
  /** Reservations found past their expiry. */
  readonly expiredCount: number;
  /** Reservations actually released by this run (others were committed or released concurrently). */
  readonly releasedCount: number;
}
