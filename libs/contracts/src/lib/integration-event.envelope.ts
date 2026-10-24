/**
 * Kafka message value wrapping every integration event.
 *
 * @typeParam TPayload - Event-specific payload, e.g. {@link OrderPlacedPayload}.
 */
export interface IntegrationEventEnvelope<TPayload> {
  /** Unique event identifier (UUID); consumers deduplicate on it. */
  readonly eventId: string;
  /** Event type, e.g. `order.placed`. */
  readonly eventType: string;
  /** Identifier of the aggregate that raised the event (also the Kafka message key). */
  readonly aggregateId: string;
  /** Moment the event occurred, in epoch milliseconds. */
  readonly occurredAt: number;
  readonly payload: TPayload;
}
