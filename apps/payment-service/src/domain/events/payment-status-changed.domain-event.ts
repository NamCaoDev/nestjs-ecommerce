import { DomainEvent } from '@org/shared-domain';
import { PaymentStatus } from '../types/payment-status.type';
import { PaymentLine } from '../value-objects/payment-line.type';
import { PaymentStatusChangedDomainEventProps } from './payment-status-changed-domain-event.props';

/**
 * Raised on every payment status transition (PAID, FAILED, PARTIALLY_REFUNDED, REFUNDED).
 */
export class PaymentStatusChangedDomainEvent implements DomainEvent {
  /** Event name. */
  public static readonly EVENT_NAME: string = 'payment.status_changed';
  public readonly eventId: string = crypto.randomUUID();
  public readonly eventName: string =
    PaymentStatusChangedDomainEvent.EVENT_NAME;
  public readonly aggregateId: string;
  public readonly occurredAt: number;
  public readonly orderId: string;
  public readonly from: PaymentStatus;
  public readonly to: PaymentStatus;
  public readonly transactionId: string;
  public readonly gatewayTxId: string;
  public readonly totalAmount: number;
  public readonly refundedAmount: number;
  public readonly currency: string;
  public readonly failureReason: string | undefined;
  public readonly lines: readonly PaymentLine[];

  /**
   * @param props - Transition, cause and amounts.
   */
  public constructor(props: PaymentStatusChangedDomainEventProps) {
    this.aggregateId = props.paymentId;
    this.occurredAt = props.occurredAt;
    this.orderId = props.orderId;
    this.from = props.from;
    this.to = props.to;
    this.transactionId = props.transactionId;
    this.gatewayTxId = props.gatewayTxId;
    this.totalAmount = props.totalAmount;
    this.refundedAmount = props.refundedAmount;
    this.currency = props.currency;
    this.failureReason = props.failureReason;
    this.lines = props.lines;
  }
}
