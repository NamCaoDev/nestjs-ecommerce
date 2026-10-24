import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../domain/aggregates/order.aggregate';
import { OrderStatus } from '../../domain/value-objects/order-status.vo';
import { InboxEntry } from '../ports/inbox-entry.type';

/**
 * Input of {@link PaymentOutcomeProcessor.execute}.
 */
export interface ProcessPaymentOutcomeInput {
  readonly entry: InboxEntry;
  readonly orderId: string;
  /** Saga correlation id, for the logs. */
  readonly correlationId: string;
  /** Status the event leads to. */
  readonly targetStatus: OrderStatus;
  /** Domain method moving a PENDING order to the target status. */
  readonly transition: (order: Order) => Result<void, DomainError>;
}
