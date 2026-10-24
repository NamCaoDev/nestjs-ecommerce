import { DomainEvent } from '@org/shared-domain';
import { OrderPlacedEventProps } from './order-placed-event.props';

/**
 * Raised when a new order has been placed.
 */
export class OrderPlacedEvent implements DomainEvent {
  /** Event name used as the outbox / Kafka message type. */
  public static readonly EVENT_NAME: string = 'order.placed';
  public readonly eventId: string = crypto.randomUUID();
  public readonly eventName: string = OrderPlacedEvent.EVENT_NAME;
  public readonly aggregateId: string;
  public readonly occurredAt: number;
  public readonly customerId: string;
  public readonly totalAmount: number;
  public readonly currency: string;
  public readonly items: OrderPlacedEventProps['items'];

  /**
   * @param props - Order data captured when the order was placed.
   */
  public constructor(props: OrderPlacedEventProps) {
    this.aggregateId = props.orderId;
    this.occurredAt = props.occurredAt;
    this.customerId = props.customerId;
    this.totalAmount = props.totalAmount;
    this.currency = props.currency;
    this.items = props.items;
  }
}
