/**
 * Body of a `201 Created` response to `POST /orders`.
 */
export interface CreateOrderResponse {
  readonly orderId: string;
  /** Customer-facing order code. */
  readonly orderCode: string;
  /** Order total in major currency units. */
  readonly totalAmount: number;
  /** ISO 4217 currency code of the total. */
  readonly currency: string;
}
