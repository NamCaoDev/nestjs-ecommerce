import { Order } from '../aggregates/order.aggregate';

/**
 * Input of {@link OrderRepositoryPort.saveWithOutbox}.
 */
export interface SaveOrderWithOutboxInput {
  /** Newly placed order whose pending domain events become outbox messages. */
  readonly order: Order;
  /** Client Idempotency-Key, stored with the order; an application concern kept out of the aggregate. */
  readonly idempotencyKey: string;
}
