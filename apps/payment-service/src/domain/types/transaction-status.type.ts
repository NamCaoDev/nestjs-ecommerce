/**
 * State of a ledger entry; mirrors the `transaction_status` database enum. Every status but PENDING is final.
 */
export type TransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
