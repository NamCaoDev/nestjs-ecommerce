import { PaymentStatus } from '../../../domain/types/payment-status.type';

/**
 * State of a payment after a refund.
 */
export interface RefundPaymentOutput {
  readonly paymentId: string;
  /** UUID of the REFUND ledger entry. */
  readonly refundTransactionId: string;
  readonly status: PaymentStatus;
  /** Unchanged by refunds. */
  readonly totalAmount: number;
  readonly refundedAmount: number;
  readonly currency: string;
}
