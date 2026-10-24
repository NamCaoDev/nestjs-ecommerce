import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentStatus } from '../types/payment-status.type';
import { Money } from '../value-objects/money.vo';
import { OrderReference } from '../value-objects/order-reference.vo';
import { PaymentId } from '../value-objects/payment-id.vo';

/**
 * Complete state of a {@link Payment}, used by {@link Payment.restore} when loading from persistence.
 */
export interface PaymentProps {
  readonly id: PaymentId;
  readonly orderReference: OrderReference;
  readonly totalAmount: Money;
  readonly refundedAmount: Money;
  readonly status: PaymentStatus;
  readonly transactions: readonly PaymentTransaction[];
  /** Optimistic concurrency version. */
  readonly version: number;
  /** Epoch milliseconds. */
  readonly createdAt?: number;
  /** Epoch milliseconds. */
  readonly updatedAt?: number;
}
