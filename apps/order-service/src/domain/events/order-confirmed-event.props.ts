/**
 * Data carried by an {@link OrderConfirmedEvent}.
 */
export interface OrderConfirmedEventProps {
  readonly orderId: string;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
}
