import { Query } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentReadModel } from '../../read-models/payment.read-model';

/**
 * Query reading the payment of an order. Handled by {@link GetPaymentByOrderIdHandler}.
 */
export class GetPaymentByOrderIdQuery extends Query<
  Result<PaymentReadModel, PaymentNotFoundError>
> {
  /** Logical order identifier (UUID). */
  public readonly orderId: string;

  /**
   * @param props - Order identifier.
   */
  public constructor({ orderId }: { readonly orderId: string }) {
    super();
    this.orderId = orderId;
  }
}
