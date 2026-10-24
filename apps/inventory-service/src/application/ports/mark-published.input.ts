/**
 * Input of {@link InventoryOutboxPort.markPublished}.
 */
export interface MarkPublishedInput {
  readonly ids: readonly string[];
  /** Epoch milliseconds. */
  readonly publishedAt: number;
}
