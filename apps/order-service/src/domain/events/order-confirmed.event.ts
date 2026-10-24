import { DomainEvent } from '@org/shared-domain';
import { OrderConfirmedEventProps } from './order-confirmed-event.props';

/**
 * Raised when a pending order has been confirmed.
 */
export class OrderConfirmedEvent implements DomainEvent {
  /** Event name used as the outbox / Kafka message type. */
  public static readonly EVENT_NAME: string = 'order.confirmed';
  public readonly eventId: string = crypto.randomUUID();
  public readonly eventName: string = OrderConfirmedEvent.EVENT_NAME;
  public readonly aggregateId: string;
  public readonly occurredAt: number;

  /**
   * @param props - Confirmed order identifier and confirmation time.
   */
  public constructor({ orderId, occurredAt }: OrderConfirmedEventProps) {
    this.aggregateId = orderId;
    this.occurredAt = occurredAt;
  }
}
