import { TransactionStatus } from './transaction-status.type';

/**
 * Ledger entry state machine: only a PENDING entry moves, once, to a final status.
 * Mirrored by the `payment_transactions_guard` trigger of payment_db.
 */
export const TRANSACTION_STATUS_TRANSITIONS: Readonly<
  Record<TransactionStatus, readonly TransactionStatus[]>
> = {
  PENDING: ['SUCCESS', 'FAILED', 'CANCELLED'],
  SUCCESS: [],
  FAILED: [],
  CANCELLED: [],
} as const;
