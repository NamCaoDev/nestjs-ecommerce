import { StatusTransition } from '../types/status-transition.type';
import { TRANSACTION_STATUS_TRANSITIONS } from '../types/transaction-status-transitions';
import { TransactionStatus } from '../types/transaction-status.type';

/**
 * @param transition - Current and requested ledger entry statuses.
 * @returns `true` when the ledger state machine allows the move.
 */
export function canTransitionTransactionStatus({
  from,
  to,
}: StatusTransition<TransactionStatus>): boolean {
  return TRANSACTION_STATUS_TRANSITIONS[from].includes(to);
}
