/**
 * Outbox row claimed by a relay.
 */
export interface ClaimedOutboxRecord {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
  readonly retryCount: number;
}
