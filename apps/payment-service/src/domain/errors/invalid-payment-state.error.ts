import { DomainError } from '@org/shared-domain';
import { PaymentStatus } from '../types/payment-status.type';

/**
 * Raised when an operation is not allowed in the current payment status.
 */
export class InvalidPaymentStateError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.INVALID_STATE';

  /**
   * @param details - Refused operation and current status.
   */
  public constructor({
    operation,
    status,
  }: {
    readonly operation: string;
    readonly status: PaymentStatus;
  }) {
    super(`Cannot ${operation} a payment that is ${status}.`);
  }
}
