import { DomainError } from '@org/shared-domain';

/**
 * Raised when a ledger entry is created with invalid data.
 */
export class InvalidTransactionError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.INVALID_TRANSACTION';

  /**
   * @param reason - Rule that was violated.
   */
  public constructor(reason: string) {
    super(`Invalid transaction: ${reason}`);
  }
}
