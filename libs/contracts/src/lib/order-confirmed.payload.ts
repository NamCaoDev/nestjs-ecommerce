/**
 * Integration event payload published when an order has been confirmed.
 */
export interface OrderConfirmedPayload {
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** Confirmation time in epoch milliseconds. */
  readonly confirmedAt: number;
}
