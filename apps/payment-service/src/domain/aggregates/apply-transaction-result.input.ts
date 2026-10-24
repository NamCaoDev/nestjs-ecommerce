import { TransactionLookup } from './transaction-lookup.type';
import { TransactionResult } from './transaction-result.type';

/**
 * Input of {@link Payment.applyTransactionResult}.
 */
export interface ApplyTransactionResultInput {
  /** Charge the result belongs to. */
  readonly lookup: TransactionLookup;
  readonly result: TransactionResult;
}
