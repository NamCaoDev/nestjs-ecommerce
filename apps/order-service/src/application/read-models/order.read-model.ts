/**
 * Read model of one order, as returned by the query side (no aggregate involved).
 * Amounts are in major currency units; timestamps are epoch milliseconds.
 */
export interface OrderReadModel {
  readonly orderId: string;
  readonly orderCode: string;
  readonly customerId: string;
  readonly status: string;
  readonly currency: string;
  readonly subtotalAmount: number;
  readonly shippingAmount: number;
  readonly discountAmount: number;
  readonly totalAmount: number;
  readonly shippingAddress: Record<string, unknown>;
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly productName: string;
    readonly quantity: number;
    readonly unitPrice: number;
    readonly lineTotal: number;
  }>;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}
