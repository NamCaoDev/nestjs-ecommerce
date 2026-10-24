import { TransactionStatus } from './transaction-status.type';

/**
 * Status a pending ledger entry can be finalised with.
 */
export type FinalTransactionStatus = Exclude<TransactionStatus, 'PENDING'>;
