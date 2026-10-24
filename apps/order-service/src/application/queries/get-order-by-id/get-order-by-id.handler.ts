import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { OrderNotFoundError } from '../../../domain/errors/order-not-found.error';
import type { OrderReadPort } from '../../ports/order-read.port';
import { ORDER_READ_PORT } from '../../ports/order-read.token';
import { OrderReadModel } from '../../read-models/order.read-model';
import { GetOrderByIdQuery } from './get-order-by-id.query';

/**
 * Reads one order straight from storage into its read model.
 */
@QueryHandler(GetOrderByIdQuery)
export class GetOrderByIdHandler implements IQueryHandler<
  GetOrderByIdQuery,
  Result<OrderReadModel, OrderNotFoundError>
> {
  /**
   * @param orderRead - Query-side order storage.
   */
  public constructor(
    @Inject(ORDER_READ_PORT) private readonly orderRead: OrderReadPort,
  ) {}

  /**
   * @param query - Order identifier.
   * @returns The order, or an {@link OrderNotFoundError}.
   */
  public async execute(
    query: GetOrderByIdQuery,
  ): Promise<Result<OrderReadModel, OrderNotFoundError>> {
    const order: OrderReadModel | undefined = await this.orderRead.findById(
      query.orderId,
    );
    if (order === undefined) {
      return Result.fail(new OrderNotFoundError(query.orderId));
    }
    return Result.ok(order);
  }
}
