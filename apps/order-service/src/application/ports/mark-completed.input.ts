/**
 * Input of {@link IdempotencyPort.markCompleted}.
 */
export interface MarkCompletedInput {
  /** Customer owning the key; keys are unique per customer. */
  readonly customerId: string;
  /** Client Idempotency-Key. */
  readonly key: string;
  /** How long the completed key is remembered, in seconds. */
  readonly ttlSeconds: number;
}
