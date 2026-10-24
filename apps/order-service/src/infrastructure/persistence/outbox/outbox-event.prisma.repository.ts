import { Injectable } from '@nestjs/common';
import { MarkFailedInput } from '../../../application/ports/mark-failed.input';
import { MarkPublishedInput } from '../../../application/ports/mark-published.input';
import { OutboxEventRepositoryPort } from '../../../application/ports/outbox-event-repository.port';
import { OutboxMessage } from '../../../application/ports/outbox-message.type';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxClaimRow } from './outbox-claim.row';

/** Longest stored error message; longer reasons are truncated. */
const MAX_ERROR_LENGTH = 1_000;

/** How long a claim is held; a relay that crashes loses its claim after this lease. */
const CLAIM_LEASE_SECONDS = 60;

/**
 * Prisma implementation of {@link OutboxEventRepositoryPort}, safe with several relay instances.
 *
 * Claiming runs one statement: rows are locked with `FOR UPDATE SKIP LOCKED` (concurrent relays skip
 * them instead of waiting) and switched to `PROCESSING` with a lease. Only the oldest unpublished
 * event of each aggregate is claimable, so two instances never publish events of the same order
 * out of order. Rows whose lease expired are claimable again.
 */
@Injectable()
export class OutboxEventPrismaRepository implements OutboxEventRepositoryPort {
  /**
   * @param prisma - Client for `order_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param limit - Maximum number of messages.
   * @returns The claimed messages, oldest first.
   */
  public async claimPendingBatch(limit: number): Promise<OutboxMessage[]> {
    const rows: OutboxClaimRow[] = await this.prisma.client.$queryRaw<
      OutboxClaimRow[]
    >`
      UPDATE outbox_events AS claimed
      SET status = 'PROCESSING'::outbox_status,
          locked_until = now() + make_interval(secs => ${CLAIM_LEASE_SECONDS})
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
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING claimed.id, claimed.aggregate_id, claimed.event_type, claimed.payload,
                claimed.occurred_at, claimed.retry_count`;
    return rows
      .map(OutboxEventPrismaRepository.toMessage)
      .sort(
        (left: OutboxMessage, right: OutboxMessage): number =>
          left.occurredAt - right.occurredAt,
      );
  }

  /**
   * @param input - Message ids and publication time.
   */
  public async markPublished({
    ids,
    publishedAt,
  }: MarkPublishedInput): Promise<void> {
    await this.prisma.client.outboxEvent.updateMany({
      where: { id: { in: [...ids] } },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(publishedAt),
        lockedUntil: null,
      },
    });
  }

  /**
   * Returns the messages to `PENDING` for the next run and records the attempt.
   *
   * @param input - Message ids and failure reason.
   */
  public async markFailed({ ids, error }: MarkFailedInput): Promise<void> {
    await this.prisma.client.outboxEvent.updateMany({
      where: { id: { in: [...ids] } },
      data: {
        status: 'PENDING',
        lockedUntil: null,
        retryCount: { increment: 1 },
        lastError: error.slice(0, MAX_ERROR_LENGTH),
      },
    });
  }

  /**
   * @returns The application view of a claimed row.
   */
  private static toMessage(row: OutboxClaimRow): OutboxMessage {
    return {
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      occurredAt: row.occurred_at.getTime(),
      retryCount: row.retry_count,
    };
  }
}
