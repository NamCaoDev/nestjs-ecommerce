import { DomainEvent } from '@org/shared-domain';
import { OrderCancelledEventProps } from './order-cancelled-event.props';

/**
 * Raised when a pending order has been cancelled.
 */
export class OrderCancelledEvent implements DomainEvent {
  /** Event name used as the outbox / Kafka message type. */
  public static readonly EVENT_NAME: string = 'order.cancelled';
  public readonly eventId: string = crypto.randomUUID();
  public readonly eventName: string = OrderCancelledEvent.EVENT_NAME;
  public readonly aggregateId: string;
  public readonly occurredAt: number;
  public readonly reason: string;
  public readonly items: OrderCancelledEventProps['items'];

  /**
   * @param props - Cancelled order identifier, reason, items to release and cancellation time.
   */
  public constructor(props: OrderCancelledEventProps) {
    this.aggregateId = props.orderId;
    this.occurredAt = props.occurredAt;
    this.reason = props.reason;
    this.items = props.items;
  }
}
