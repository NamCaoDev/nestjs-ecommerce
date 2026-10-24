import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { OrderReadPort } from '../../ports/order-read.port';
import { ORDER_READ_PORT } from '../../ports/order-read.token';
import { OrdersPageReadModel } from '../../read-models/orders-page.read-model';
import { GetOrdersByCustomerQuery } from './get-orders-by-customer.query';

/**
 * Lists a customer's orders, newest first, straight from storage into read models.
 */
@QueryHandler(GetOrdersByCustomerQuery)
export class GetOrdersByCustomerHandler implements IQueryHandler<
  GetOrdersByCustomerQuery,
  OrdersPageReadModel
> {
  /**
   * @param orderRead - Query-side order storage.
   */
  public constructor(
    @Inject(ORDER_READ_PORT) private readonly orderRead: OrderReadPort,
  ) {}

  /**
   * @param query - Customer and page.
   * @returns The requested page.
   */
  public execute(
    query: GetOrdersByCustomerQuery,
  ): Promise<OrdersPageReadModel> {
    return this.orderRead.findByCustomer({
      customerId: query.customerId,
      page: query.page,
      limit: query.limit,
    });
  }
}
