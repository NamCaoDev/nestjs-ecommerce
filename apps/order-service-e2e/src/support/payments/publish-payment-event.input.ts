/**
 * Input of {@link PaymentEventsProducer.publish}.
 */
export interface PublishPaymentEventInput {
  readonly eventType: 'payment.succeeded' | 'payment.failed';
  /** Event id, sent in the envelope and the `event-id` header. */
  readonly eventId: string;
  readonly orderId: string;
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
  }>;
  readonly reason?: string;
}
