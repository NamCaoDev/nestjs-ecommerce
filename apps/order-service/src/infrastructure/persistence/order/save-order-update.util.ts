import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderConcurrencyConflictError } from '../../../domain/errors/order-concurrency-conflict.error';
import { Prisma } from '../prisma/generated/client';
import { OutboxEventMapper } from './outbox-event.mapper';

/**
 * Inside a transaction: updates the order status if the stored version still matches (optimistic
 * locking) and appends one outbox row per pending domain event.
 *
 * @param input - Transaction client and changed order.
 * @throws {OrderConcurrencyConflictError} When the stored version differs.
 */
export async function saveOrderUpdate({
  transaction,
  order,
}: {
  readonly transaction: Prisma.TransactionClient;
  readonly order: Order;
}): Promise<void> {
  const { count }: { count: number } = await transaction.order.updateMany({
    where: { id: order.id.value, version: order.version },
    data: {
      status: order.status.value,
      version: { increment: 1 },
      updatedAt: new Date(order.updatedAt),
    },
  });
  if (count === 0) {
    throw new OrderConcurrencyConflictError(order.id.value);
  }
  await transaction.outboxEvent.createMany({
    data: order.domainEvents.map(OutboxEventMapper.toCreateInput),
  });
}
