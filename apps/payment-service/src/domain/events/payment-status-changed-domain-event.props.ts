import { PaymentStatus } from '../types/payment-status.type';
import { PaymentLine } from '../value-objects/payment-line.type';

/**
 * Data carried by a {@link PaymentStatusChangedDomainEvent}.
 */
export interface PaymentStatusChangedDomainEventProps {
  readonly paymentId: string;
  readonly orderId: string;
  readonly from: PaymentStatus;
  readonly to: PaymentStatus;
  /** Ledger entry that caused the change. */
  readonly transactionId: string;
  readonly gatewayTxId: string;
  /** Amounts in major currency units after the change. */
  readonly totalAmount: number;
  readonly refundedAmount: number;
  readonly currency: string;
  readonly failureReason?: string;
  /** Ordered lines, forwarded to the inventory. */
  readonly lines: readonly PaymentLine[];
  /** Epoch milliseconds. */
  readonly occurredAt: number;
}
