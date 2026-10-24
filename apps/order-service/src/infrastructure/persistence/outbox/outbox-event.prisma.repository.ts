import { Injectable } from '@nestjs/common';
import {
  claimOutboxBatch,
  markOutboxFailed,
  markOutboxPublished,
} from '@org/shared-infrastructure';
import { MarkFailedInput } from '../../../application/ports/mark-failed.input';
import { MarkPublishedInput } from '../../../application/ports/mark-published.input';
import { OutboxEventRepositoryPort } from '../../../application/ports/outbox-event-repository.port';
import { OutboxMessage } from '../../../application/ports/outbox-message.type';
import { PrismaService } from '../prisma/prisma.service';

/** How long a claim is held; a relay that crashes loses its claim after this lease. */
const CLAIM_LEASE_SECONDS = 60;

/**
 * Prisma implementation of {@link OutboxEventRepositoryPort} on top of the shared outbox statements
 * (`FOR UPDATE SKIP LOCKED` claims with a lease, per-aggregate ordering), safe with several relays.
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
  public claimPendingBatch(limit: number): Promise<OutboxMessage[]> {
    return claimOutboxBatch({
      client: this.prisma.client,
      limit,
      leaseSeconds: CLAIM_LEASE_SECONDS,
    });
  }

  /**
   * @param input - Message ids and publication time.
   */
  public markPublished({
    ids,
    publishedAt,
  }: MarkPublishedInput): Promise<void> {
    return markOutboxPublished({
      client: this.prisma.client,
      ids,
      publishedAt,
    });
  }

  /**
   * @param input - Message ids and failure reason.
   */
  public markFailed({ ids, error }: MarkFailedInput): Promise<void> {
    return markOutboxFailed({ client: this.prisma.client, ids, error });
  }
}
