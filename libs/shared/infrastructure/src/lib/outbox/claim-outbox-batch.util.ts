import { ClaimOutboxBatchInput } from './claim-outbox-batch.input';
import { ClaimedOutboxRecord } from './claimed-outbox-record.type';

/** Row shape returned by {@link CLAIM_OUTBOX_BATCH_SQL}. */
interface OutboxClaimRow {
  readonly id: string;
  readonly aggregate_id: string;
  readonly event_type: string;
  readonly payload: Record<string, unknown>;
  readonly occurred_at: Date;
  readonly retry_count: number;
}

/**
 * Claims rows in one statement: `FOR UPDATE SKIP LOCKED` lets concurrent relays skip each other's rows,
 * the claimed rows become `PROCESSING` with a lease, rows with an expired lease are claimable again,
 * and only the oldest unpublished event of each aggregate is taken so per-aggregate order holds.
 * $1 = lease seconds, $2 = batch size.
 */
const CLAIM_OUTBOX_BATCH_SQL = `
  UPDATE outbox_events AS claimed
  SET status = 'PROCESSING'::outbox_status,
      locked_until = now() + make_interval(secs => $1)
  WHERE claimed.id IN (
    SELECT candidate.id
    FROM outbox_events AS candidate
    WHERE (
        candidate.status = 'PENDING'::outbox_status
        OR (candidate.status = 'PROCESSING'::outbox_status AND candidate.locked_until < now())
      )
      AND NOT EXISTS (
        SELECT 1
        FROM outbox_events AS earlier
        WHERE earlier.aggregate_id = candidate.aggregate_id
          AND earlier.status <> 'PUBLISHED'::outbox_status
          AND (earlier.occurred_at, earlier.id) < (candidate.occurred_at, candidate.id)
      )
    ORDER BY candidate.occurred_at, candidate.id
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  )
  RETURNING claimed.id, claimed.aggregate_id, claimed.event_type, claimed.payload,
            claimed.occurred_at, claimed.retry_count`;

/**
 * Claims a batch of the service's `outbox_events` for this relay instance (safe with several instances).
 *
 * @param input - Prisma client, batch size and lease.
 * @returns The claimed rows, oldest first.
 */
export async function claimOutboxBatch({
  client,
  limit,
  leaseSeconds,
}: ClaimOutboxBatchInput): Promise<ClaimedOutboxRecord[]> {
  const rows: OutboxClaimRow[] = await client.$queryRawUnsafe<OutboxClaimRow[]>(
    CLAIM_OUTBOX_BATCH_SQL,
    leaseSeconds,
    limit,
  );
  return rows
    .map((row: OutboxClaimRow): ClaimedOutboxRecord => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      occurredAt: row.occurred_at.getTime(),
      retryCount: row.retry_count,
    }))
    .sort(
      (left: ClaimedOutboxRecord, right: ClaimedOutboxRecord): number =>
        left.occurredAt - right.occurredAt,
    );
}
