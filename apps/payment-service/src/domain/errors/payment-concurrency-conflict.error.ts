import { DomainError } from '@org/shared-domain';

/**
 * Raised when a payment changed in storage since it was loaded (optimistic concurrency).
 */
export class PaymentConcurrencyConflictError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.CONCURRENCY_CONFLICT';

  /**
   * @param paymentId - Payment whose stored version no longer matches.
   */
  public constructor(paymentId: string) {
    super(`Payment ${paymentId} was modified concurrently; reload and retry.`);
  }
}
