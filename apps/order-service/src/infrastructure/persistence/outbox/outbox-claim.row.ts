/**
 * Row returned by the outbox claim query (raw SQL, snake_case columns).
 */
export interface OutboxClaimRow {
  readonly id: string;
  readonly aggregate_id: string;
  readonly event_type: string;
  readonly payload: Record<string, unknown>;
  readonly occurred_at: Date;
  readonly retry_count: number;
}
