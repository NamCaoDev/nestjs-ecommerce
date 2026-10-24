/**
 * Input of {@link OutboxEventRepositoryPort.markFailed}.
 */
export interface MarkFailedInput {
  readonly ids: readonly string[];
  /** Reason of the failed attempt, stored for diagnosis. */
  readonly error: string;
}
