/**
 * Integration event payload published when an order has been placed.
 * Amounts are in major currency units; timestamps are epoch milliseconds.
 */
export interface OrderPlacedPayload {
  /** Logical order identifier (UUID). */
  readonly orderId: string;
  /** Logical customer identifier (UUID). */
  readonly customerId: string;
  /** Total amount charged for the order. */
  readonly finalAmount: number;
  /** ISO 4217 currency code of every amount. */
  readonly currency: string;
  /** Ordered SKUs with the unit price captured at purchase time. */
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
    readonly unitPrice: number;
  }>;
  /** Creation time of the order in epoch milliseconds. */
  readonly createdAt: number;
}
