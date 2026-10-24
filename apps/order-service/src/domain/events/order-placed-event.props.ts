/**
 * Data carried by an {@link OrderPlacedEvent}.
 */
export interface OrderPlacedEventProps {
  readonly orderId: string;
  readonly customerId: string;
  /** Order total in major currency units. */
  readonly totalAmount: number;
  /** ISO 4217 currency code of every amount. */
  readonly currency: string;
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
    readonly unitPrice: number;
  }>;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
}
