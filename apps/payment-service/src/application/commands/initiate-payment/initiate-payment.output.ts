import { PaymentClientAction } from '../../../domain/ports/payment-client-action.type';

/**
 * Payment opened (or found) for an order.
 */
export interface InitiatePaymentOutput {
  readonly paymentId: string;
  /** Charge UUID (merchant reference at the gateway). */
  readonly transactionId: string;
  /** What the customer must do to pay; absent when an existing payment is returned. */
  readonly clientAction?: PaymentClientAction;
}
