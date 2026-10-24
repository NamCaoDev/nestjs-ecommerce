import { readEnv } from '@org/shared-infrastructure';

/** Default lifetime of an uncommitted reservation: 15 minutes. */
const DEFAULT_RESERVATION_TTL_SECONDS = '900';

/** Retention of reservation hashes and order indexes for deduplication: 7 days. */
const RESERVATION_RETENTION_SECONDS = 604_800;

/**
 * Reservation timings. `RESERVATION_TTL_SECONDS` can be lowered to exercise the sweeper locally.
 */
export class ReservationTimingConfig {
  /** Seconds before an uncommitted reservation is released by the sweeper. */
  public static readonly ttlSeconds: number = Number(
    readEnv({
      name: 'RESERVATION_TTL_SECONDS',
      defaultValue: DEFAULT_RESERVATION_TTL_SECONDS,
    }),
  );

  /** Seconds reservation hashes and order indexes are kept; garbage collection only, never expiry. */
  public static readonly retentionSeconds: number =
    RESERVATION_RETENTION_SECONDS;
}
