/**
 * Input of {@link InventoryOutboxPort.markFailed}.
 */
export interface MarkFailedInput {
  readonly ids: readonly string[];
  /** Reason of the failed attempt. */
  readonly error: string;
}
