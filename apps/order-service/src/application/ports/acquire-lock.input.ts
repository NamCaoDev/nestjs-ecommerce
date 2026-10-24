/**
 * Input of {@link IdempotencyPort.acquireLock}.
 */
export interface AcquireLockInput {
  /** Customer owning the key; keys are unique per customer. */
  readonly customerId: string;
  /** Client Idempotency-Key. */
  readonly key: string;
  /** How long the key stays `PROCESSING`, in seconds; expires on its own if the process crashes. */
  readonly ttlSeconds: number;
}
