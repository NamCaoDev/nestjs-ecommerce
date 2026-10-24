import { DomainError } from '@org/shared-domain';

/**
 * Raised when a payment already exists for the order or the idempotency key.
 */
export class DuplicatePaymentError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.DUPLICATE';

  /**
   * @param orderId - Order that already has a payment.
   */
  public constructor(orderId: string) {
    super(`A payment already exists for order ${orderId}.`);
  }
}
