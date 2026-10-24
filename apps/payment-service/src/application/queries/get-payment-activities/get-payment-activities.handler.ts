import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import type { PaymentReadPort } from '../../ports/payment-read.port';
import { PAYMENT_READ_PORT } from '../../ports/payment-read.token';
import { PaymentActivityReadModel } from '../../read-models/payment-activity.read-model';
import { GetPaymentActivitiesQuery } from './get-payment-activities.query';

/**
 * Reads the activity log of a payment, oldest first, for operations and customer care.
 */
@QueryHandler(GetPaymentActivitiesQuery)
export class GetPaymentActivitiesHandler implements IQueryHandler<
  GetPaymentActivitiesQuery,
  Result<readonly PaymentActivityReadModel[], PaymentNotFoundError>
> {
  /**
   * @param paymentRead - Read-side access to payments.
   */
  public constructor(
    @Inject(PAYMENT_READ_PORT) private readonly paymentRead: PaymentReadPort,
  ) {}

  /**
   * @param query - Payment identifier.
   * @returns The activities, or a {@link PaymentNotFoundError} for an unknown payment.
   */
  public async execute(
    query: GetPaymentActivitiesQuery,
  ): Promise<
    Result<readonly PaymentActivityReadModel[], PaymentNotFoundError>
  > {
    const activities: readonly PaymentActivityReadModel[] | undefined =
      await this.paymentRead.findActivities(query.paymentId);
    return activities === undefined
      ? Result.fail(new PaymentNotFoundError(query.paymentId))
      : Result.ok(activities);
  }
}
