/**
 * Outcome of one inventory outbox relay run.
 */
export interface RelayInventoryOutboxOutput {
  /** Events applied to Redis (or already applied) and marked `PUBLISHED`. */
  readonly publishedCount: number;
  /** Events returned to `PENDING` because Redis failed. */
  readonly failedCount: number;
}
