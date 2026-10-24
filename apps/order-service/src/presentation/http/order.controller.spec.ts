import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetOrderByIdQuery } from '../../application/queries/get-order-by-id/get-order-by-id.query';
import { GetOrdersByCustomerQuery } from '../../application/queries/get-orders-by-customer/get-orders-by-customer.query';
import { OrderNotFoundError } from '../../domain/errors/order-not-found.error';
import { Result } from '@org/shared-domain';
import { CreateOrderCommand } from '../../application/commands/create-order/create-order.command';
import { CreateOrderOutput } from '../../application/commands/create-order/create-order.output';
import { StockReservationFailedError } from '../../application/errors/stock-reservation-failed.error';
import { CreateOrderResponse } from './create-order.response';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderController } from './order.controller';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';

const INPUT_DTO: CreateOrderDto = {
  customerId: '0199a7c0-0000-7000-8000-0000000000c1',
  currency: 'USD',
  items: [
    {
      skuId: '0199a7c0-0000-7000-8000-0000000000a1',
      productName: 'Mug',
      quantity: 2,
      unitPrice: 19.99,
    },
  ],
  shippingAddress: {
    recipientName: 'Nguyen Van A',
    phoneNumber: '+84900000000',
    line1: '1 Le Loi',
    city: 'Ho Chi Minh City',
    postalCode: '700000',
    countryCode: 'VN',
  },
};

describe('OrderController', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let mockQueryBus: { readonly execute: jest.Mock };
  let controller: OrderController;
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn() };
    mockQueryBus = { execute: jest.fn() };
    controller = new OrderController(
      mockCommandBus as unknown as CommandBus,
      mockQueryBus as unknown as QueryBus,
    );
  });
  describe('createOrder', () => {
    it('should dispatch CreateOrderCommand with the Idempotency-Key and return the summary', async () => {
      // Arrange
      const expectedOutput: CreateOrderOutput = {
        orderId: '0199a7c0-0000-7000-8000-000000000001',
        orderCode: 'ORD-000000000001',
        totalAmount: 39.98,
        currency: 'USD',
      };
      mockCommandBus.execute.mockResolvedValue(Result.ok(expectedOutput));
      // Act
      const actualResponse: CreateOrderResponse = await controller.createOrder(
        'checkout-42',
        INPUT_DTO,
      );
      // Assert
      const actualCommand: CreateOrderCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toBeInstanceOf(CreateOrderCommand);
      expect(actualCommand.idempotencyKey).toBe('checkout-42');
      expect(actualCommand.items).toEqual(INPUT_DTO.items);
      expect(actualResponse).toEqual(expectedOutput);
    });
    it('should throw the failure so the global filter can map it', async () => {
      // Arrange
      const expectedError: StockReservationFailedError =
        new StockReservationFailedError();
      mockCommandBus.execute.mockResolvedValue(Result.fail(expectedError));
      // Act
      const actualCall: Promise<CreateOrderResponse> = controller.createOrder(
        'checkout-42',
        INPUT_DTO,
      );
      // Assert
      await expect(actualCall).rejects.toBe(expectedError);
    });
  });
  describe('getOrder', () => {
    it('should dispatch GetOrderByIdQuery and return the read model', async () => {
      // Arrange
      const expectedOrder: { orderId: string } = { orderId: ORDER_ID };
      mockQueryBus.execute.mockResolvedValue(Result.ok(expectedOrder));
      // Act
      const actualOrder: unknown = await controller.getOrder(ORDER_ID);
      // Assert
      const actualQuery: GetOrderByIdQuery =
        mockQueryBus.execute.mock.calls[0][0];
      expect(actualQuery).toBeInstanceOf(GetOrderByIdQuery);
      expect(actualQuery.orderId).toBe(ORDER_ID);
      expect(actualOrder).toBe(expectedOrder);
    });
    it('should throw OrderNotFoundError for the global filter (HTTP 404)', async () => {
      // Arrange
      const expectedError: OrderNotFoundError = new OrderNotFoundError(
        ORDER_ID,
      );
      mockQueryBus.execute.mockResolvedValue(Result.fail(expectedError));
      // Act
      const actualCall: Promise<unknown> = controller.getOrder(ORDER_ID);
      // Assert
      await expect(actualCall).rejects.toBe(expectedError);
    });
  });
  describe('listOrders', () => {
    it('should dispatch GetOrdersByCustomerQuery with the page', async () => {
      // Arrange
      const expectedPage: Record<string, unknown> = {
        items: [],
        page: 2,
        limit: 10,
        total: 11,
      };
      mockQueryBus.execute.mockResolvedValue(expectedPage);
      // Act
      const actualPage: unknown = await controller.listOrders({
        customerId: INPUT_DTO.customerId,
        page: 2,
        limit: 10,
      });
      // Assert
      const actualQuery: GetOrdersByCustomerQuery =
        mockQueryBus.execute.mock.calls[0][0];
      expect(actualQuery).toBeInstanceOf(GetOrdersByCustomerQuery);
      expect(actualQuery).toMatchObject({
        customerId: INPUT_DTO.customerId,
        page: 2,
        limit: 10,
      });
      expect(actualPage).toBe(expectedPage);
    });
  });
  describe('getSmokeTest', () => {
    it('should report the service as ok', () => {
      // Arrange
      const expectedService: string = 'order-service';
      // Act
      const actualResponse: { status: string; service: string } =
        controller.getSmokeTest();
      // Assert
      expect(actualResponse).toMatchObject({
        status: 'ok',
        service: expectedService,
      });
    });
  });
});
