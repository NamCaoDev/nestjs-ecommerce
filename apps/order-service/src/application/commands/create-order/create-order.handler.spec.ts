import { Result } from '@org/shared-domain';
import { EmptyOrderError } from '../../../domain/errors/empty-order.error';
import { InvalidAddressError } from '../../../domain/errors/invalid-address.error';
import { InvalidMoneyError } from '../../../domain/errors/invalid-money.error';
import { OrderPlacedEvent } from '../../../domain/events/order-placed.event';
import { OrderRepositoryPort } from '../../../domain/ports/order-repository.port';
import { SaveOrderWithOutboxInput } from '../../../domain/ports/save-order-with-outbox.input';
import { DuplicateRequestError } from '../../errors/duplicate-request.error';
import { StockReservationFailedError } from '../../errors/stock-reservation-failed.error';
import { IdempotencyPort } from '../../ports/idempotency.port';
import { InventoryRpcPort } from '../../ports/inventory-rpc.port';
import { ReleaseLockInput } from '../../ports/release-lock.input';
import { ReleaseStockInput } from '../../ports/release-stock.input';
import { CreateOrderCommandProps } from './create-order-command.props';
import { CreateOrderCommand } from './create-order.command';
import { CreateOrderHandler } from './create-order.handler';
import { CreateOrderOutput } from './create-order.output';

const IDEMPOTENCY_KEY = 'checkout-42';
const CUSTOMER_ID = '0199a7c0-0000-7000-8000-0000000000c1';
const SKU_ID = '0199a7c0-0000-7000-8000-0000000000a1';
const ORDER_CODE_PATTERN: RegExp = /^ORD-[0-9A-F]{12}$/;
const EXPECTED_LOCK: ReleaseLockInput = {
  customerId: CUSTOMER_ID,
  key: IDEMPOTENCY_KEY,
};
const EXPECTED_STOCK: ReleaseStockInput = expect.objectContaining({
  idempotencyKey: `${CUSTOMER_ID}:${IDEMPOTENCY_KEY}`,
  items: [{ skuId: SKU_ID, quantity: 2 }],
});

/**
 * Builds a valid command, optionally overriding some fields.
 */
const createInputCommand = (
  overrides: Partial<CreateOrderCommandProps> = {},
): CreateOrderCommand =>
  new CreateOrderCommand({
    idempotencyKey: IDEMPOTENCY_KEY,
    customerId: CUSTOMER_ID,
    currency: 'USD',
    items: [
      { skuId: SKU_ID, productName: 'Mug', quantity: 2, unitPrice: 19.99 },
    ],
    shippingAddress: {
      recipientName: 'Nguyen Van A',
      phoneNumber: '+84900000000',
      line1: '1 Le Loi',
      city: 'Ho Chi Minh City',
      postalCode: '700000',
      countryCode: 'VN',
    },
    ...overrides,
  });

describe('CreateOrderHandler', () => {
  let mockOrderRepository: jest.Mocked<OrderRepositoryPort>;
  let mockInventoryRpc: jest.Mocked<InventoryRpcPort>;
  let mockIdempotency: jest.Mocked<IdempotencyPort>;
  let handler: CreateOrderHandler;
  beforeEach(() => {
    mockOrderRepository = {
      findById: jest.fn(),
      saveWithOutbox: jest.fn().mockResolvedValue(Result.ok()),
      updateWithOutbox: jest.fn(),
    };
    mockInventoryRpc = {
      reserveStock: jest.fn().mockResolvedValue(Result.ok()),
      releaseStock: jest.fn().mockResolvedValue(undefined),
    };
    mockIdempotency = {
      acquireLock: jest.fn().mockResolvedValue(Result.ok()),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    handler = new CreateOrderHandler(
      mockOrderRepository,
      mockInventoryRpc,
      mockIdempotency,
    );
  });
  describe('execute', () => {
    it('should reserve stock, persist the order with its outbox event and mark the key completed', async () => {
      // Arrange
      const inputCommand: CreateOrderCommand = createInputCommand();
      // Act
      const actualResult: Result<CreateOrderOutput, Error> =
        await handler.execute(inputCommand);
      // Assert
      const actualOutput: CreateOrderOutput = actualResult.getValue();
      expect(actualOutput.totalAmount).toBe(39.98);
      expect(actualOutput.currency).toBe('USD');
      expect(actualOutput.orderCode).toMatch(ORDER_CODE_PATTERN);
      expect(mockIdempotency.acquireLock).toHaveBeenCalledWith({
        ...EXPECTED_LOCK,
        ttlSeconds: 120,
      });
      expect(mockInventoryRpc.reserveStock).toHaveBeenCalledWith(
        EXPECTED_STOCK,
      );
      const actualSaveInput: SaveOrderWithOutboxInput =
        mockOrderRepository.saveWithOutbox.mock.calls[0][0];
      expect(actualSaveInput.idempotencyKey).toBe(IDEMPOTENCY_KEY);
      expect(actualSaveInput.order.id.value).toBe(actualOutput.orderId);
      expect(actualSaveInput.order.orderCode.value).toBe(
        actualOutput.orderCode,
      );
      expect(mockInventoryRpc.reserveStock).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: actualOutput.orderId }),
      );
      expect(actualSaveInput.order.domainEvents[0]).toBeInstanceOf(
        OrderPlacedEvent,
      );
      expect(mockIdempotency.markCompleted).toHaveBeenCalledWith({
        ...EXPECTED_LOCK,
        ttlSeconds: 86_400,
      });
      expect(mockInventoryRpc.releaseStock).not.toHaveBeenCalled();
      expect(mockIdempotency.releaseLock).not.toHaveBeenCalled();
    });
    it('should reject a duplicate request without touching inventory or persistence', async () => {
      // Arrange
      const expectedError: DuplicateRequestError = new DuplicateRequestError(
        IDEMPOTENCY_KEY,
      );
      mockIdempotency.acquireLock.mockResolvedValue(Result.fail(expectedError));
      // Act
      const actualResult: Result<CreateOrderOutput, Error> =
        await handler.execute(createInputCommand());
      // Assert
      expect(actualResult.getError()).toBe(expectedError);
      expect(mockInventoryRpc.reserveStock).not.toHaveBeenCalled();
      expect(mockOrderRepository.saveWithOutbox).not.toHaveBeenCalled();
      expect(mockIdempotency.releaseLock).not.toHaveBeenCalled();
    });
    it.each([
      {
        scenario: 'an empty order',
        overrides: { items: [] },
        expectedErrorType: EmptyOrderError,
      },
      {
        scenario: 'a price with too many decimals',
        overrides: {
          items: [
            {
              skuId: SKU_ID,
              productName: 'Mug',
              quantity: 1,
              unitPrice: 0.12345,
            },
          ],
        },
        expectedErrorType: InvalidMoneyError,
      },
      {
        scenario: 'an incomplete address',
        overrides: {
          shippingAddress: {
            recipientName: '',
            phoneNumber: '+84900000000',
            line1: '1 Le Loi',
            city: 'Ho Chi Minh City',
            postalCode: '700000',
            countryCode: 'VN',
          },
        },
        expectedErrorType: InvalidAddressError,
      },
    ])(
      'should reject $scenario before reserving stock and release the key',
      async ({ overrides, expectedErrorType }) => {
        // Arrange
        const inputCommand: CreateOrderCommand = createInputCommand(overrides);
        // Act
        const actualResult: Result<CreateOrderOutput, Error> =
          await handler.execute(inputCommand);
        // Assert
        expect(actualResult.getError()).toBeInstanceOf(expectedErrorType);
        expect(mockInventoryRpc.reserveStock).not.toHaveBeenCalled();
        expect(mockIdempotency.releaseLock).toHaveBeenCalledWith(EXPECTED_LOCK);
      },
    );
    it('should not persist nor compensate when inventory refuses the reservation', async () => {
      // Arrange
      const expectedError: StockReservationFailedError =
        new StockReservationFailedError();
      mockInventoryRpc.reserveStock.mockResolvedValue(
        Result.fail(expectedError),
      );
      // Act
      const actualResult: Result<CreateOrderOutput, Error> =
        await handler.execute(createInputCommand());
      // Assert
      expect(actualResult.getError()).toBe(expectedError);
      expect(mockOrderRepository.saveWithOutbox).not.toHaveBeenCalled();
      expect(mockInventoryRpc.releaseStock).not.toHaveBeenCalled();
      expect(mockIdempotency.releaseLock).toHaveBeenCalledWith(EXPECTED_LOCK);
    });
    it('should release the stock when the reservation call crashes with an unknown outcome', async () => {
      // Arrange
      const expectedError: Error = new Error('DEADLINE_EXCEEDED');
      mockInventoryRpc.reserveStock.mockRejectedValue(expectedError);
      // Act
      const actualExecution: Promise<Result<CreateOrderOutput, Error>> =
        handler.execute(createInputCommand());
      // Assert
      await expect(actualExecution).rejects.toBe(expectedError);
      expect(mockInventoryRpc.releaseStock).toHaveBeenCalledWith(
        EXPECTED_STOCK,
      );
      expect(mockOrderRepository.saveWithOutbox).not.toHaveBeenCalled();
      expect(mockIdempotency.releaseLock).toHaveBeenCalledWith(EXPECTED_LOCK);
    });
    it('should keep the reservation when the Idempotency-Key is already persisted with another order', async () => {
      // Arrange
      const expectedError: DuplicateRequestError = new DuplicateRequestError(
        IDEMPOTENCY_KEY,
      );
      mockOrderRepository.saveWithOutbox.mockResolvedValue(
        Result.fail(expectedError),
      );
      // Act
      const actualResult: Result<CreateOrderOutput, Error> =
        await handler.execute(createInputCommand());
      // Assert
      expect(actualResult.getError()).toBe(expectedError);
      expect(mockInventoryRpc.releaseStock).not.toHaveBeenCalled();
      expect(mockIdempotency.markCompleted).not.toHaveBeenCalled();
      expect(mockIdempotency.releaseLock).toHaveBeenCalledWith(EXPECTED_LOCK);
    });
    it('should release the stock when persistence returns any other failure', async () => {
      // Arrange
      const expectedError: Error = new Error('optimistic lock conflict');
      mockOrderRepository.saveWithOutbox.mockResolvedValue(
        Result.fail(expectedError),
      );
      // Act
      const actualResult: Result<CreateOrderOutput, Error> =
        await handler.execute(createInputCommand());
      // Assert
      expect(actualResult.getError()).toBe(expectedError);
      expect(mockInventoryRpc.releaseStock).toHaveBeenCalledWith(
        EXPECTED_STOCK,
      );
    });
    it('should release the stock and rethrow when persistence crashes', async () => {
      // Arrange
      const expectedError: Error = new Error('connection reset');
      mockOrderRepository.saveWithOutbox.mockRejectedValue(expectedError);
      // Act
      const actualExecution: Promise<Result<CreateOrderOutput, Error>> =
        handler.execute(createInputCommand());
      // Assert
      await expect(actualExecution).rejects.toBe(expectedError);
      expect(mockInventoryRpc.releaseStock).toHaveBeenCalledWith(
        EXPECTED_STOCK,
      );
      expect(mockIdempotency.releaseLock).toHaveBeenCalledWith(EXPECTED_LOCK);
    });
    it('should keep the original error when the compensation itself fails', async () => {
      // Arrange
      const expectedError: Error = new Error('connection reset');
      mockOrderRepository.saveWithOutbox.mockRejectedValue(expectedError);
      mockInventoryRpc.releaseStock.mockRejectedValue(new Error('UNAVAILABLE'));
      jest
        .spyOn(handler['logger'], 'error')
        .mockImplementation((): void => undefined);
      // Act
      const actualExecution: Promise<Result<CreateOrderOutput, Error>> =
        handler.execute(createInputCommand());
      // Assert
      await expect(actualExecution).rejects.toBe(expectedError);
      expect(handler['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining(IDEMPOTENCY_KEY),
        expect.any(String),
      );
    });
  });
});
