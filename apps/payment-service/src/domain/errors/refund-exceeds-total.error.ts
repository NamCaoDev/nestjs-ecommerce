import { DomainError } from '@org/shared-domain';

/**
 * Raised when a refund would make the refunded amount exceed the total paid.
 */
export class RefundExceedsTotalError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.REFUND_EXCEEDS_TOTAL';

  /**
   * @param details - Requested refund and the amount still refundable.
   */
  public constructor({
    requested,
    refundable,
    currency,
  }: {
    readonly requested: number;
    readonly refundable: number;
    readonly currency: string;
  }) {
    super(
      `Refund of ${requested} ${currency} exceeds the refundable ${refundable} ${currency}.`,
    );
  }
}
