import { Order } from '../../../domain/aggregates/order.aggregate';

/**
 * Input of {@link OrderPersistenceMapper.toCreateInput}.
 */
export interface ToCreateOrderInputInput {
  readonly order: Order;
  readonly idempotencyKey: string;
}
