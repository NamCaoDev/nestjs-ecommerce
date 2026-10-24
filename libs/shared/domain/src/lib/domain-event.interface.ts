/**
 * Contract for an immutable fact raised by an {@link AggregateRoot} after a state change.
 * Events are persisted through the Transactional Outbox and published asynchronously.
 */
export interface DomainEvent {
  /** Unique event identifier (UUID) used by consumers for idempotent processing. */
  readonly eventId: string;
  /** Stable event name used as the message type, e.g. `order.placed`. */
  readonly eventName: string;
  /** Logical identifier of the aggregate that raised the event. */
  readonly aggregateId: string;
  /** Moment the event occurred in the domain, in epoch milliseconds. */
  readonly occurredAt: number;
}
