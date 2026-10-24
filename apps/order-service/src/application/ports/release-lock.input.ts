/**
 * Input of {@link IdempotencyPort.releaseLock}.
 */
export interface ReleaseLockInput {
  /** Customer owning the key; keys are unique per customer. */
  readonly customerId: string;
  /** Client Idempotency-Key. */
  readonly key: string;
}
