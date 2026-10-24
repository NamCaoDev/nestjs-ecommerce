import { PaymentLineItem } from './payment-line-item.type';

/**
 * Integration event payload published when the gateway reports that an order could not be paid.
 * Timestamps are epoch milliseconds.
 */
export interface PaymentFailedPayload {
  /** Logical payment identifier (UUID). */
  readonly paymentId: string;
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** Transaction id reported by the gateway. */
  readonly gatewayTxId: string;
  /** Reason reported by the gateway, e.g. `CARD_DECLINED`. */
  readonly reason: string;
  /** Lines of the unpaid order, so the inventory can release them. */
  readonly items: readonly PaymentLineItem[];
  /** Time the payment failed, in epoch milliseconds. */
  readonly failedAt: number;
}
