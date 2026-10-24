import { DomainEvent } from '@org/shared-domain';
import { TransactionStatus } from '../types/transaction-status.type';
import { TransactionType } from '../types/transaction-type.type';
import { PaymentTransactionFinalizedDomainEventProps } from './payment-transaction-finalized-domain-event.props';

/**
 * Raised when a ledger entry reaches its final status (a charge result, or a confirmed refund).
 */
export class PaymentTransactionFinalizedDomainEvent implements DomainEvent {
  /** Event name. */
  public static readonly EVENT_NAME: string = 'payment.transaction_finalized';
  public readonly eventId: string = crypto.randomUUID();
  public readonly eventName: string =
    PaymentTransactionFinalizedDomainEvent.EVENT_NAME;
  public readonly aggregateId: string;
  public readonly occurredAt: number;
  public readonly orderId: string;
  public readonly transactionId: string;
  public readonly type: TransactionType;
  public readonly status: TransactionStatus;
  public readonly gatewayTxId: string;
  public readonly amount: number;
  public readonly currency: string;
  public readonly failureReason: string | undefined;

  /**
   * @param props - Ledger entry and its outcome.
   */
  public constructor(props: PaymentTransactionFinalizedDomainEventProps) {
    this.aggregateId = props.paymentId;
    this.occurredAt = props.occurredAt;
    this.orderId = props.orderId;
    this.transactionId = props.transactionId;
    this.type = props.type;
    this.status = props.status;
    this.gatewayTxId = props.gatewayTxId;
    this.amount = props.amount;
    this.currency = props.currency;
    this.failureReason = props.failureReason;
  }
}
