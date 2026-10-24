import { PaymentActivityReadModel } from '../read-models/payment-activity.read-model';
import { PaymentReadModel } from '../read-models/payment.read-model';

/**
 * Read-side access to payments, without loading aggregates. Injected with {@link PAYMENT_READ_PORT}.
 */
export interface PaymentReadPort {
  /**
   * @param orderId - Logical order identifier.
   * @returns The payment of the order, or `undefined`.
   */
  findByOrderId(orderId: string): Promise<PaymentReadModel | undefined>;

  /**
   * @param paymentId - Payment UUID.
   * @returns The activity log oldest first, or `undefined` when the payment does not exist.
   */
  findActivities(
    paymentId: string,
  ): Promise<readonly PaymentActivityReadModel[] | undefined>;

  /**
   * @param transactionId - Ledger entry UUID.
   * @returns The payment owning the entry, or `undefined`.
   */
  findPaymentIdByTransactionId(
    transactionId: string,
  ): Promise<string | undefined>;
}
