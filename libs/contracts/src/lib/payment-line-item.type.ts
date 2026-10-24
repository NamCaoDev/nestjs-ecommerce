/**
 * SKU and quantity of an order line, as forwarded by payment events so the inventory can commit or
 * release the stock even when the reservation has already expired.
 */
export interface PaymentLineItem {
  /** Logical SKU identifier (UUID). */
  readonly skuId: string;
  readonly quantity: number;
}
