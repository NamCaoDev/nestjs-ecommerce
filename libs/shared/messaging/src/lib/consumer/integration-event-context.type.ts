/**
 * Delivery metadata of one consumed integration event.
 */
export interface IntegrationEventContext {
  /** Event id (header `event-id`, else the envelope); the deduplication key of inboxes. */
  readonly eventId: string;
  /** Saga correlation id (header `x-correlation-id`, else the event id), for tracing. */
  readonly correlationId: string;
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
}
