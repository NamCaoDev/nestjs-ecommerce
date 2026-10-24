/**
 * Data of a {@link RefundPaymentCommand}.
 */
export interface RefundPaymentCommandProps {
  readonly paymentId: string;
  /** Amount to refund, in major currency units of the payment. */
  readonly amount: number;
  readonly reason: string;
  /** `Idempotency-Key` of the request; a replay refunds nothing twice. */
  readonly idempotencyKey: string;
  /** Operator requesting the refund. */
  readonly actorId?: string;
  readonly ipAddress?: string;
}
