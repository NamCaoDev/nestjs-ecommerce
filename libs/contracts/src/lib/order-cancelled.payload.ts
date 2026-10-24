/**
 * Integration event payload published when an order has been cancelled,
 * so that inventory can release the reserved stock.
 */
export interface OrderCancelledPayload {
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** Human-readable cancellation reason. */
  readonly reason: string;
  /** SKUs and quantities to release. */
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
  }>;
}
