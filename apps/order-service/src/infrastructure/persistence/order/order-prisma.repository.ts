import { Injectable } from '@nestjs/common';
import { Result } from '@org/shared-domain';
import { DuplicateRequestError } from '../../../application/errors/duplicate-request.error';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderConcurrencyConflictError } from '../../../domain/errors/order-concurrency-conflict.error';
import { OrderRepositoryPort } from '../../../domain/ports/order-repository.port';
import { SaveOrderWithOutboxInput } from '../../../domain/ports/save-order-with-outbox.input';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { isIdempotencyKeyViolation } from './is-idempotency-key-violation.util';
import { OrderPersistenceMapper } from './order-persistence.mapper';
import { OrderWithItemsRecord } from './order-with-items.record';
import { OutboxEventMapper } from './outbox-event.mapper';

/**
 * Prisma implementation of {@link OrderRepositoryPort} with a transactional outbox (CLAUDE.md §4.2).
 */
@Injectable()
export class OrderPrismaRepository implements OrderRepositoryPort {
  /**
   * @param prisma - Client for `order_db`.
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * @param id - Order identifier.
   * @returns The order with its lines, or `undefined` when none exists.
   */
  public async findById(id: OrderId): Promise<Order | undefined> {
    const record: OrderWithItemsRecord | null =
      await this.prisma.client.order.findUnique({
        where: { id: id.value },
        include: { items: true },
      });
    if (record === null) {
      return undefined;
    }
    return OrderPersistenceMapper.toDomain(record);
  }

  /**
   * Inserts the order, its lines and one outbox row per pending domain event in one local
   * transaction; nothing is written if any statement fails. Clears the events on success.
   *
   * @param input - Order and the request Idempotency-Key.
   * @returns Success, or a {@link DuplicateRequestError} when the Idempotency-Key is already stored.
   */
  public async saveWithOutbox({
    order,
    idempotencyKey,
  }: SaveOrderWithOutboxInput): Promise<Result<void, Error>> {
    try {
      await this.prisma.client.$transaction(
        async (transaction: Prisma.TransactionClient): Promise<void> => {
          await transaction.order.create({
            data: OrderPersistenceMapper.toCreateInput({
              order,
              idempotencyKey,
            }),
          });
          await transaction.outboxEvent.createMany({
            data: order.domainEvents.map(OutboxEventMapper.toCreateInput),
          });
        },
      );
    } catch (err) {
      if (isIdempotencyKeyViolation(err)) {
        return Result.fail(new DuplicateRequestError(idempotencyKey));
      }
      throw err;
    }
    order.clearEvents();
    return Result.ok();
  }

  /**
   * Updates status and version only if the stored version still matches, and appends the outbox
   * rows, in one local transaction.
   *
   * @param order - Modified order.
   * @throws {OrderConcurrencyConflictError} When the stored version differs.
   */
  public async updateWithOutbox(order: Order): Promise<void> {
    await this.prisma.client.$transaction(
      async (transaction: Prisma.TransactionClient): Promise<void> => {
        const { count }: { count: number } = await transaction.order.updateMany(
          {
            where: { id: order.id.value, version: order.version },
            data: {
              status: order.status.value,
              version: { increment: 1 },
              updatedAt: new Date(order.updatedAt),
            },
          },
        );
        if (count === 0) {
          throw new OrderConcurrencyConflictError(order.id.value);
        }
        await transaction.outboxEvent.createMany({
          data: order.domainEvents.map(OutboxEventMapper.toCreateInput),
        });
      },
    );
    order.clearEvents();
  }
}
