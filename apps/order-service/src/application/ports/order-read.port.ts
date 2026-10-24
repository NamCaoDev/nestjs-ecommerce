import { OrderReadModel } from '../read-models/order.read-model';
import { OrdersPageReadModel } from '../read-models/orders-page.read-model';
import { FindOrdersByCustomerInput } from './find-orders-by-customer.input';

/**
 * Query-side access to orders: reads storage directly into read models, bypassing the aggregate.
 * Injected with {@link ORDER_READ_PORT}.
 */
export interface OrderReadPort {
  /**
   * @param orderId - Order UUID.
   * @returns The order, or `undefined` when it does not exist.
   */
  findById(orderId: string): Promise<OrderReadModel | undefined>;

  /**
   * @param input - Customer and page.
   * @returns The requested page, newest orders first.
   */
  findByCustomer(
    input: FindOrdersByCustomerInput,
  ): Promise<OrdersPageReadModel>;
}
