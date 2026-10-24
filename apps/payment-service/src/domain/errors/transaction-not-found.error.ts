import { DomainError } from '@org/shared-domain';

/**
 * Raised when a gateway result names a ledger entry the payment does not have.
 */
export class TransactionNotFoundError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.TRANSACTION_NOT_FOUND';

  /**
   * @param reference - Transaction id or gateway transaction id that was looked up.
   */
  public constructor(reference: string) {
    super(`No transaction matches ${reference}.`);
  }
}
