import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import type { PaymentReadPort } from '../../ports/payment-read.port';
import { PAYMENT_READ_PORT } from '../../ports/payment-read.token';
import { PaymentReadModel } from '../../read-models/payment.read-model';
import { GetPaymentByOrderIdQuery } from './get-payment-by-order-id.query';

/**
 * Reads the payment of an order with its ledger, without loading the aggregate.
 */
@QueryHandler(GetPaymentByOrderIdQuery)
export class GetPaymentByOrderIdHandler implements IQueryHandler<
  GetPaymentByOrderIdQuery,
  Result<PaymentReadModel, PaymentNotFoundError>
> {
  /**
   * @param paymentRead - Read-side access to payments.
   */
  public constructor(
    @Inject(PAYMENT_READ_PORT) private readonly paymentRead: PaymentReadPort,
  ) {}

  /**
   * @param query - Order identifier.
   * @returns The payment, or a {@link PaymentNotFoundError} when the order has none (yet).
   */
  public async execute(
    query: GetPaymentByOrderIdQuery,
  ): Promise<Result<PaymentReadModel, PaymentNotFoundError>> {
    const payment: PaymentReadModel | undefined =
      await this.paymentRead.findByOrderId(query.orderId);
    return payment === undefined
      ? Result.fail(new PaymentNotFoundError(query.orderId))
      : Result.ok(payment);
  }
}
