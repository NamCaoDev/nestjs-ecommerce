import { Result } from '@org/shared-domain';
import { OrderNotFoundError } from '../../../domain/errors/order-not-found.error';
import { OrderReadPort } from '../../ports/order-read.port';
import { OrderReadModel } from '../../read-models/order.read-model';
import { GetOrderByIdHandler } from './get-order-by-id.handler';
import { GetOrderByIdQuery } from './get-order-by-id.query';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';

describe('GetOrderByIdHandler', () => {
  let mockOrderRead: jest.Mocked<OrderReadPort>;
  let handler: GetOrderByIdHandler;
  beforeEach(() => {
    mockOrderRead = { findById: jest.fn(), findByCustomer: jest.fn() };
    handler = new GetOrderByIdHandler(mockOrderRead);
  });
  it('should return the read model of an existing order', async () => {
    // Arrange
    const expectedOrder: OrderReadModel = {
      orderId: ORDER_ID,
    } as OrderReadModel;
    mockOrderRead.findById.mockResolvedValue(expectedOrder);
    // Act
    const actualResult: Result<OrderReadModel, OrderNotFoundError> =
      await handler.execute(new GetOrderByIdQuery({ orderId: ORDER_ID }));
    // Assert
    expect(actualResult.getValue()).toBe(expectedOrder);
    expect(mockOrderRead.findById).toHaveBeenCalledWith(ORDER_ID);
  });
  it('should fail with OrderNotFoundError for an unknown order', async () => {
    // Arrange
    mockOrderRead.findById.mockResolvedValue(undefined);
    // Act
    const actualResult: Result<OrderReadModel, OrderNotFoundError> =
      await handler.execute(new GetOrderByIdQuery({ orderId: ORDER_ID }));
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(OrderNotFoundError);
  });
});
