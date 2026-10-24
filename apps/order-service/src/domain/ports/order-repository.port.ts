import { Result } from '@org/shared-domain';
import { Order } from '../aggregates/order.aggregate';
import { OrderId } from '../value-objects/order-id.vo';
import { SaveOrderWithOutboxInput } from './save-order-with-outbox.input';

/**
 * Persistence port for the {@link Order} aggregate. Implemented in the infrastructure layer
 * and injected with {@link ORDER_REPOSITORY_PORT}.
 */
export interface OrderRepositoryPort {
  /**
   * Loads an order by identity.
   *
   * @param id - Order identifier.
   * @returns The order, or `undefined` when none exists.
   */
  findById(id: OrderId): Promise<Order | undefined>;

  /**
   * Inserts a newly placed order and its pending domain events as outbox messages in a single
   * local transaction (CLAUDE.md §4.2), then clears the events from the aggregate.
   *
   * @param input - Order and the Idempotency-Key of the request that created it.
   * @returns Success, or a duplicate-request error when the Idempotency-Key was already used.
   */
  saveWithOutbox(input: SaveOrderWithOutboxInput): Promise<Result<void, Error>>;

  /**
   * Persists the state change of an existing order and its pending domain events as outbox messages
   * in a single local transaction, then clears the events. Uses the loaded version for optimistic
   * concurrency and increments it.
   *
   * @param order - Order loaded with {@link findById} and modified through domain methods.
   * @throws {OrderConcurrencyConflictError} When the order changed in storage since it was loaded.
   */
  updateWithOutbox(order: Order): Promise<void>;
}
