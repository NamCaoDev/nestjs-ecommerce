/**
 * Data of a {@link ProcessPaymentSucceededCommand}, taken from a `payment.succeeded` event.
 */
export interface ProcessPaymentSucceededCommandProps {
  /** Event id: the inbox key. */
  readonly eventId: string;
  /** Saga correlation id, for the logs. */
  readonly correlationId: string;
  readonly orderId: string;
  /** Event payload, recorded in the inbox. */
  readonly payload: Readonly<Record<string, unknown>>;
}
