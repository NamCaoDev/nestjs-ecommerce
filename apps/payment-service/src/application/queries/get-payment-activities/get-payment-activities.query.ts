import { Query } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentActivityReadModel } from '../../read-models/payment-activity.read-model';

/**
 * Query reading the activity log of a payment. Handled by {@link GetPaymentActivitiesHandler}.
 */
export class GetPaymentActivitiesQuery extends Query<
  Result<readonly PaymentActivityReadModel[], PaymentNotFoundError>
> {
  /** Payment UUID. */
  public readonly paymentId: string;

  /**
   * @param props - Payment identifier.
   */
  public constructor({ paymentId }: { readonly paymentId: string }) {
    super();
    this.paymentId = paymentId;
  }
}
