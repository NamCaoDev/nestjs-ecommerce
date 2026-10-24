import { DomainError } from '@org/shared-domain';
import { TransactionStatus } from '../types/transaction-status.type';

/**
 * Raised when a ledger entry that is already final is asked to change: the ledger is append-only.
 */
export class TransactionAlreadyFinalizedError extends DomainError {
  /** Stable error code for transport mapping. */
  public readonly code: string = 'PAYMENT.TRANSACTION_ALREADY_FINALIZED';

  /**
   * @param details - Ledger entry and its final status.
   */
  public constructor({
    transactionId,
    status,
  }: {
    readonly transactionId: string;
    readonly status: TransactionStatus;
  }) {
    super(`Transaction ${transactionId} is already ${status}.`);
  }
}
