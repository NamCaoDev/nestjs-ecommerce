/**
 * Data carried by an {@link OrderCancelledEvent}.
 */
export interface OrderCancelledEventProps {
  readonly orderId: string;
  readonly reason: string;
  /** SKUs and quantities whose reservation must be released. */
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
  }>;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
}
