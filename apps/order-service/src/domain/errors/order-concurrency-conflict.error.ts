import { DomainError } from '@org/shared-domain';

/**
 * Raised when an order changed in storage since it was loaded (optimistic concurrency).
 */
export class OrderConcurrencyConflictError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'ORDER.CONCURRENCY_CONFLICT';

  /**
   * @param orderId - Order whose stored version no longer matches.
   */
  public constructor(orderId: string) {
    super(`Order ${orderId} was modified concurrently; reload and retry.`);
  }
}
