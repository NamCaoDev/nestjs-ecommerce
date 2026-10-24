/**
 * Data of a {@link ProcessPaymentFailedCommand}, taken from a `payment.failed` event.
 */
export interface ProcessPaymentFailedCommandProps {
  /** Event id: the inbox key. */
  readonly eventId: string;
  /** Saga correlation id, for the logs. */
  readonly correlationId: string;
  readonly orderId: string;
  /** Reason reported by the gateway, e.g. `CARD_DECLINED`. */
  readonly reason: string;
  /** Event payload, recorded in the inbox. */
  readonly payload: Readonly<Record<string, unknown>>;
}
