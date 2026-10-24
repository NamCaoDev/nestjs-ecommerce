/**
 * Read model of one order line. Amounts are in major currency units.
 */
export interface OrderItemReadModel {
  readonly skuId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
}
