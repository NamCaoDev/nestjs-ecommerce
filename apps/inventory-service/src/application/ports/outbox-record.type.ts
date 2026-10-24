/**
 * Outbox event claimed by the inventory relay.
 */
export interface OutboxRecord {
  readonly id: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
  readonly retryCount: number;
}
