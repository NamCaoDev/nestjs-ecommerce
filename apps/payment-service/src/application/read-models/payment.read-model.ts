import { PaymentStatus } from '../../domain/types/payment-status.type';
import { PaymentTransactionReadModel } from './payment-transaction.read-model';

/**
 * Payment as returned by the read side.
 */
export interface PaymentReadModel {
  readonly paymentId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly status: PaymentStatus;
  /** Amount owed, in major currency units; never changes. */
  readonly totalAmount: number;
  readonly refundedAmount: number;
  readonly currency: string;
  /** What the customer must do to pay, while a charge is pending. */
  readonly clientAction: Readonly<Record<string, unknown>> | null;
  readonly transactions: readonly PaymentTransactionReadModel[];
  readonly version: number;
  /** Epoch milliseconds. */
  readonly createdAt: number;
  /** Epoch milliseconds. */
  readonly updatedAt: number;
}
