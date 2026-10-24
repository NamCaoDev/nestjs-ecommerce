import { DomainEvent } from '@org/shared-domain';
import { PaymentChannel } from '../types/payment-channel.type';
import { PaymentGatewayProvider } from '../types/payment-gateway-provider.type';
import { PaymentInitiatedDomainEventProps } from './payment-initiated-domain-event.props';

/**
 * Raised when the first charge of a payment is opened at a gateway.
 */
export class PaymentInitiatedDomainEvent implements DomainEvent {
  /** Event name. */
  public static readonly EVENT_NAME: string = 'payment.initiated';
  public readonly eventId: string = crypto.randomUUID();
  public readonly eventName: string = PaymentInitiatedDomainEvent.EVENT_NAME;
  public readonly aggregateId: string;
  public readonly occurredAt: number;
  public readonly orderId: string;
  public readonly transactionId: string;
  public readonly gateway: PaymentGatewayProvider;
  public readonly channel: PaymentChannel;
  public readonly amount: number;
  public readonly currency: string;

  /**
   * @param props - Payment, charge and gateway.
   */
  public constructor(props: PaymentInitiatedDomainEventProps) {
    this.aggregateId = props.paymentId;
    this.occurredAt = props.occurredAt;
    this.orderId = props.orderId;
    this.transactionId = props.transactionId;
    this.gateway = props.gateway;
    this.channel = props.channel;
    this.amount = props.amount;
    this.currency = props.currency;
  }
}
