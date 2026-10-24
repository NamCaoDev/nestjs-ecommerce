/**
 * Successful outcome of {@link CreateOrderHandler}.
 */
export interface CreateOrderOutput {
  /** Identifier of the placed order. */
  readonly orderId: string;
  /** Customer-facing order code. */
  readonly orderCode: string;
  /** Order total in major currency units. */
  readonly totalAmount: number;
  /** ISO 4217 currency code of the total. */
  readonly currency: string;
}
