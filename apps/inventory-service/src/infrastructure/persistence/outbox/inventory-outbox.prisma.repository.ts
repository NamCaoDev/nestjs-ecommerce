import { Injectable } from '@nestjs/common';
import {
  claimOutboxBatch,
  markOutboxFailed,
  markOutboxPublished,
} from '@org/shared-infrastructure';
import { InventoryOutboxPort } from '../../../application/ports/inventory-outbox.port';
import { MarkFailedInput } from '../../../application/ports/mark-failed.input';
import { MarkPublishedInput } from '../../../application/ports/mark-published.input';
import { OutboxRecord } from '../../../application/ports/outbox-record.type';
import { PrismaService } from '../prisma/prisma.service';

/** How long a claim is held; a relay that crashes loses its claim after this lease. */
const CLAIM_LEASE_SECONDS = 60;

/**
 * Prisma implementation of {@link InventoryOutboxPort} on top of the shared outbox statements
 * (`FOR UPDATE SKIP LOCKED` claims with a lease), safe with several relay instances.
 */
@Injectable()
export class InventoryOutboxPrismaRepository implements InventoryOutboxPort {
  /**
   * @param prisma - Client for `inventory_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param limit - Maximum number of events.
   * @returns The claimed events, oldest first.
   */
  public claimPendingBatch(limit: number): Promise<OutboxRecord[]> {
    return claimOutboxBatch({
      client: this.prisma.client,
      limit,
      leaseSeconds: CLAIM_LEASE_SECONDS,
    });
  }

  /**
   * @param input - Event ids and publication time.
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
   * @param input - Event ids and failure reason.
   */
  public markFailed({ ids, error }: MarkFailedInput): Promise<void> {
    return markOutboxFailed({ client: this.prisma.client, ids, error });
  }
}
