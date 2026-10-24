import { DomainError } from '@org/shared-domain';

/**
 * Raised when no payment matches an order, a payment id or a transaction reference.
 */
export class PaymentNotFoundError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.NOT_FOUND';

  /**
   * @param reference - Order id, payment id or transaction id that was looked up.
   */
  public constructor(reference: string) {
    super(`No payment matches ${reference}.`);
  }
}
