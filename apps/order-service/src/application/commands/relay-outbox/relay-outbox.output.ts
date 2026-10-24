/**
 * Outcome of one outbox relay run.
 */
export interface RelayOutboxOutput {
  readonly publishedCount: number;
  readonly failedCount: number;
}
