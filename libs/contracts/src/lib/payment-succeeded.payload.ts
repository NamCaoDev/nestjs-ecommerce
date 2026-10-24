import { PaymentLineItem } from './payment-line-item.type';

/**
 * Integration event payload published when the gateway confirms that an order has been paid.
 * Amounts are in major currency units; timestamps are epoch milliseconds.
 */
export interface PaymentSucceededPayload {
  /** Logical payment identifier (UUID). */
  readonly paymentId: string;
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** Amount captured. */
  readonly amount: number;
  /** ISO 4217 currency code. */
  readonly currency: string;
  /** Transaction id reported by the gateway. */
  readonly gatewayTxId: string;
  /** Lines of the paid order, so the inventory can ship them. */
  readonly items: readonly PaymentLineItem[];
  /** Time the payment succeeded, in epoch milliseconds. */
  readonly succeededAt: number;
}
