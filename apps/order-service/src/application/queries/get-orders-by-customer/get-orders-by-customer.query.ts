import { Query } from '@nestjs/cqrs';
import { FindOrdersByCustomerInput } from '../../ports/find-orders-by-customer.input';
import { OrdersPageReadModel } from '../../read-models/orders-page.read-model';

/**
 * Query listing a customer's orders, one page at a time. Handled by {@link GetOrdersByCustomerHandler}.
 */
export class GetOrdersByCustomerQuery extends Query<OrdersPageReadModel> {
  public readonly customerId: string;
  /** 1-based page number. */
  public readonly page: number;
  public readonly limit: number;

  /**
   * @param props - Customer and page.
   */
  public constructor({ customerId, page, limit }: FindOrdersByCustomerInput) {
    super();
    this.customerId = customerId;
    this.page = page;
    this.limit = limit;
  }
}
