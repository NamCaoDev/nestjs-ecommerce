import { Money } from '../value-objects/money.vo';
import { OrderReference } from '../value-objects/order-reference.vo';
import { PaymentId } from '../value-objects/payment-id.vo';

/**
 * Input of {@link Payment.create}.
 */
export interface CreatePaymentProps {
  readonly id: PaymentId;
  readonly orderReference: OrderReference;
  /** Amount owed; positive and immutable. */
  readonly totalAmount: Money;
}
