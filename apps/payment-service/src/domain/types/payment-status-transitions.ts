import { PaymentStatus } from './payment-status.type';

/**
 * Payment state machine: the statuses each status may move to. FAILED and REFUNDED are terminal.
 * Mirrored by the `payments_guard` trigger of payment_db.
 */
export const PAYMENT_STATUS_TRANSITIONS: Readonly<
  Record<PaymentStatus, readonly PaymentStatus[]>
> = {
  PENDING: ['PAID', 'FAILED'],
  PAID: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: [],
  FAILED: [],
} as const;
