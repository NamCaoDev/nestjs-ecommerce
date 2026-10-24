import { DomainError, Result } from '@org/shared-domain';
import { Order } from '../../../domain/aggregates/order.aggregate';
import { OrderItem } from '../../../domain/entities/order-item.entity';
import { InvalidIdentifierError } from '../../../domain/errors/invalid-identifier.error';
import { InvalidOrderStatusTransitionError } from '../../../domain/errors/invalid-order-status-transition.error';
import { OrderNotFoundError } from '../../../domain/errors/order-not-found.error';
import { OrderCancelledEvent } from '../../../domain/events/order-cancelled.event';
import { OrderRepositoryPort } from '../../../domain/ports/order-repository.port';
import { AddressSnapshot } from '../../../domain/value-objects/address-snapshot.vo';
import { Money } from '../../../domain/value-objects/money.vo';
import { OrderCode } from '../../../domain/value-objects/order-code.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { OrderStatus } from '../../../domain/value-objects/order-status.vo';
import { CancelOrderCommand } from './cancel-order.command';
import { CancelOrderHandler } from './cancel-order.handler';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const REASON = 'EXPIRED_OUT_OF_STOCK';

/**
 * Loads an order in the given status, as the repository would.
 */
function createStoredOrder(status: OrderStatus): Order {
  return Order.restore({
    id: OrderId.create(ORDER_ID).getValue(),
    orderCode: OrderCode.create('ORD-000000000001').getValue(),
    customerId: '0199a7c0-0000-7000-8000-0000000000c1',
    items: [
      OrderItem.create({
        skuId: '0199a7c0-0000-7000-8000-000000000101',
        productName: 'Mug',
        quantity: 2,
        unitPrice: Money.create({ amount: 5, currency: 'USD' }).getValue(),
      }).getValue(),
    ],
    shippingAddress: AddressSnapshot.create({
      recipientName: 'A',
      phoneNumber: '+84900000000',
      line1: '1 Le Loi',
      city: 'HCMC',
      postalCode: '700000',
      countryCode: 'VN',
    }).getValue(),
    status,
    version: 1,
  });
}

describe('CancelOrderHandler', () => {
  let mockRepository: jest.Mocked<OrderRepositoryPort>;
  let handler: CancelOrderHandler;
  beforeEach(() => {
    mockRepository = {
      findById: jest
        .fn()
        .mockResolvedValue(createStoredOrder(OrderStatus.PENDING)),
      saveWithOutbox: jest.fn(),
      updateWithOutbox: jest.fn().mockResolvedValue(undefined),
    };
    handler = new CancelOrderHandler(mockRepository);
  });
  describe('execute', () => {
    it('should cancel a pending order and persist order.cancelled through the outbox', async () => {
      // Arrange
      const inputCommand: CancelOrderCommand = new CancelOrderCommand({
        orderId: ORDER_ID,
        reason: REASON,
      });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      const actualOrder: Order =
        mockRepository.updateWithOutbox.mock.calls[0][0];
      expect(actualResult.isSuccess).toBe(true);
      expect(actualOrder.status).toBe(OrderStatus.CANCELLED);
      expect(actualOrder.domainEvents[0]).toBeInstanceOf(OrderCancelledEvent);
      expect(actualOrder.domainEvents[0]).toMatchObject({ reason: REASON });
    });
    it('should succeed without change when the order is already cancelled', async () => {
      // Arrange
      mockRepository.findById.mockResolvedValue(
        createStoredOrder(OrderStatus.CANCELLED),
      );
      // Act
      const actualResult: Result<void, DomainError> = await handler.execute(
        new CancelOrderCommand({ orderId: ORDER_ID, reason: REASON }),
      );
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockRepository.updateWithOutbox).not.toHaveBeenCalled();
    });
    it('should refuse to cancel a confirmed order', async () => {
      // Arrange
      mockRepository.findById.mockResolvedValue(
        createStoredOrder(OrderStatus.CONFIRMED),
      );
      // Act
      const actualResult: Result<void, DomainError> = await handler.execute(
        new CancelOrderCommand({ orderId: ORDER_ID, reason: REASON }),
      );
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(
        InvalidOrderStatusTransitionError,
      );
      expect(mockRepository.updateWithOutbox).not.toHaveBeenCalled();
    });
    it.each([
      { inputOrderId: 'order-1', expectedErrorType: InvalidIdentifierError },
      { inputOrderId: ORDER_ID, expectedErrorType: OrderNotFoundError },
    ])(
      'should fail with $expectedErrorType.name for $inputOrderId',
      async ({ inputOrderId, expectedErrorType }) => {
        // Arrange
        mockRepository.findById.mockResolvedValue(undefined);
        // Act
        const actualResult: Result<void, DomainError> = await handler.execute(
          new CancelOrderCommand({ orderId: inputOrderId, reason: REASON }),
        );
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(expectedErrorType);
      },
    );
  });
});
