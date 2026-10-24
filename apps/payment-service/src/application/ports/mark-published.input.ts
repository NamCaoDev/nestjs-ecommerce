/**
 * Input of {@link OutboxEventRepositoryPort.markPublished}.
 */
export interface MarkPublishedInput {
  readonly ids: readonly string[];
  /** Epoch milliseconds. */
  readonly publishedAt: number;
}
