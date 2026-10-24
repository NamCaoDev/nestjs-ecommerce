import { OrderReadPort } from '../../ports/order-read.port';
import { OrdersPageReadModel } from '../../read-models/orders-page.read-model';
import { GetOrdersByCustomerHandler } from './get-orders-by-customer.handler';
import { GetOrdersByCustomerQuery } from './get-orders-by-customer.query';

const CUSTOMER_ID = '0199a7c0-0000-7000-8000-0000000000c1';

describe('GetOrdersByCustomerHandler', () => {
  it('should read the requested page of the customer', async () => {
    // Arrange
    const expectedPage: OrdersPageReadModel = {
      items: [],
      page: 3,
      limit: 5,
      total: 12,
    };
    const mockOrderRead: jest.Mocked<OrderReadPort> = {
      findById: jest.fn(),
      findByCustomer: jest.fn().mockResolvedValue(expectedPage),
    };
    const handler: GetOrdersByCustomerHandler = new GetOrdersByCustomerHandler(
      mockOrderRead,
    );
    // Act
    const actualPage: OrdersPageReadModel = await handler.execute(
      new GetOrdersByCustomerQuery({
        customerId: CUSTOMER_ID,
        page: 3,
        limit: 5,
      }),
    );
    // Assert
    expect(actualPage).toBe(expectedPage);
    expect(mockOrderRead.findByCustomer).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      page: 3,
      limit: 5,
    });
  });
});
