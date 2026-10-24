/**
 * SKU and quantity of an order line covered by a payment.
 */
export interface PaymentLine {
  /** Logical SKU identifier (UUID); no cross-service foreign key. */
  readonly skuId: string;
  /** Positive whole number of units. */
  readonly quantity: number;
}
