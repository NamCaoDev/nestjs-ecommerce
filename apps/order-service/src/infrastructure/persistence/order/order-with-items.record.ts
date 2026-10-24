import { Prisma } from '../prisma/generated/client';

/**
 * Row of `orders` loaded together with its `order_items`.
 */
export type OrderWithItemsRecord = Prisma.OrderGetPayload<{
  include: { items: true };
}>;
