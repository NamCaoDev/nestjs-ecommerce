import { DomainError } from '@org/shared-domain';

/**
 * Raised when the order lines of a payment are missing or malformed.
 */
export class InvalidPaymentLinesError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.INVALID_LINES';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid payment lines: ${reason}`);
  }
}
