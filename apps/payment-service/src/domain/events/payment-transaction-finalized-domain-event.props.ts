import { TransactionStatus } from '../types/transaction-status.type';
import { TransactionType } from '../types/transaction-type.type';

/**
 * Data carried by a {@link PaymentTransactionFinalizedDomainEvent}.
 */
export interface PaymentTransactionFinalizedDomainEventProps {
  readonly paymentId: string;
  readonly orderId: string;
  readonly transactionId: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly gatewayTxId: string;
  /** Amount in major currency units. */
  readonly amount: number;
  readonly currency: string;
  readonly failureReason?: string;
  /** Epoch milliseconds. */
  readonly occurredAt: number;
}
