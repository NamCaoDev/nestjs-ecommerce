import { PAYMENT_STATUS_TRANSITIONS } from '../types/payment-status-transitions';
import { PaymentStatus } from '../types/payment-status.type';
import { StatusTransition } from '../types/status-transition.type';

/**
 * @param transition - Current and requested payment statuses.
 * @returns `true` when the payment state machine allows the move.
 */
export function canTransitionPaymentStatus({
  from,
  to,
}: StatusTransition<PaymentStatus>): boolean {
  return PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}
