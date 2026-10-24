/**
 * Pending integration event read from the transactional outbox.
 */
export interface OutboxMessage {
  /** Outbox row id; equals the domain event id, so consumers can deduplicate on it. */
  readonly id: string;
  /** Aggregate that raised the event; used as the Kafka message key. */
  readonly aggregateId: string;
  /** Event type, e.g. `order.placed`. */
  readonly eventType: string;
  /** Contract payload from `@org/contracts`. */
  readonly payload: Record<string, unknown>;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
  /** Failed publication attempts so far. */
  readonly retryCount: number;
}
