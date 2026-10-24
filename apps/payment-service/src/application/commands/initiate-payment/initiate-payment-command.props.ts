import { PaymentLine } from '../../../domain/value-objects/payment-line.type';

/**
 * Data of an {@link InitiatePaymentCommand}, taken from an `order.placed` event.
 */
export interface InitiatePaymentCommandProps {
  readonly orderId: string;
  readonly customerId: string;
  /** Amount owed in major currency units. */
  readonly amount: number;
  /** ISO 4217 currency code. */
  readonly currency: string;
  readonly items: readonly PaymentLine[];
  /** Key of the triggering request (the `order.placed` event id); a replay creates nothing. */
  readonly idempotencyKey: string;
}
