/**
 * Input of {@link PaymentGatewayPort.refund}.
 */
export interface RefundGatewayParams {
  readonly paymentId: string;
  readonly orderId: string;
  /** UUID of the refund entry; the merchant reference of the refund. */
  readonly refundTransactionId: string;
  /** UUID (merchant reference) of the successful charge being refunded. */
  readonly originalTransactionId: string;
  /** Gateway id of the successful charge being refunded. */
  readonly originalGatewayTxId: string;
  /** Amount to refund, in major currency units. */
  readonly amount: number;
  readonly currency: string;
  readonly reason: string;
  /** Forwarded to gateways that deduplicate refund requests. */
  readonly idempotencyKey: string;
}
