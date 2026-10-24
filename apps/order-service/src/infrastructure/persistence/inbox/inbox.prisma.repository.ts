import { Injectable } from '@nestjs/common';
import { Result } from '@org/shared-domain';
import { DuplicateInboxEventError } from '../../../application/errors/duplicate-inbox-event.error';
import { InboxEntry } from '../../../application/ports/inbox-entry.type';
import { InboxPort } from '../../../application/ports/inbox.port';
import { SaveOrderWithInboxEntryInput } from '../../../application/ports/save-order-with-inbox-entry.input';
import { saveOrderUpdate } from '../order/save-order-update.util';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { isInboxDuplicate } from './is-inbox-duplicate.util';

/**
 * Prisma implementation of {@link InboxPort} on `inbox_events` (order_db). The primary key on the event id
 * is what makes processing exactly-once: a second insert of the same event fails, and with it the whole
 * transaction that carries the order change.
 */
@Injectable()
export class InboxPrismaRepository implements InboxPort {
  /**
   * @param prisma - Client for `order_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param eventId - Event id.
   * @returns `true` when the event is in the inbox.
   */
  public async hasProcessed(eventId: string): Promise<boolean> {
    const row: { id: string } | null =
      await this.prisma.client.inboxEvent.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
    return row !== null;
  }

  /**
   * @param entry - Processed event; ignored when already recorded.
   */
  public async saveProcessed(entry: InboxEntry): Promise<void> {
    await this.prisma.client.inboxEvent.createMany({
      data: [InboxPrismaRepository.toRow(entry)],
      skipDuplicates: true,
    });
  }

  /**
   * @param input - Changed order and the event that changed it.
   * @returns Success, or a {@link DuplicateInboxEventError} when the event was recorded concurrently.
   */
  public async saveOrderWithEntry({
    order,
    entry,
  }: SaveOrderWithInboxEntryInput): Promise<
    Result<void, DuplicateInboxEventError>
  > {
    try {
      await this.prisma.client.$transaction(
        async (transaction: Prisma.TransactionClient): Promise<void> => {
          await transaction.inboxEvent.create({
            data: InboxPrismaRepository.toRow(entry),
          });
          await saveOrderUpdate({ transaction, order });
        },
      );
    } catch (err: unknown) {
      if (isInboxDuplicate(err)) {
        return Result.fail(new DuplicateInboxEventError(entry.eventId));
      }
      throw err;
    }
    order.clearEvents();
    return Result.ok();
  }

  /**
   * @returns The `inbox_events` row of an entry.
   */
  private static toRow(entry: InboxEntry): Prisma.InboxEventCreateManyInput {
    return {
      id: entry.eventId,
      eventType: entry.eventType,
      source: entry.source,
      payload: entry.payload as Prisma.InputJsonObject,
    };
  }
}
