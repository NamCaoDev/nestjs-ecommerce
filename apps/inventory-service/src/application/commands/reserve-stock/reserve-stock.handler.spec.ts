import { DomainError, Result } from '@org/shared-domain';
import { InsufficientStockError } from '../../../domain/errors/insufficient-stock.error';
import { InvalidReservationError } from '../../../domain/errors/invalid-reservation.error';
import { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { StockCommandProps } from '../stock-command.props';
import { ReserveStockCommand } from './reserve-stock.command';
import { ReserveStockHandler } from './reserve-stock.handler';

const VALID_PROPS: StockCommandProps = {
  reservationKey: '0199a7c0-0000-7000-8000-0000000000c1:checkout-42',
  orderId: '0199a7c0-0000-7000-8000-000000000001',
  items: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 2 }],
};

describe('ReserveStockHandler', () => {
  let mockStore: jest.Mocked<StockReservationStorePort>;
  let mockLedger: jest.Mocked<StockLedgerRepositoryPort>;
  let handler: ReserveStockHandler;
  beforeEach(() => {
    mockStore = {
      reserve: jest.fn().mockResolvedValue('RESERVED'),
      release: jest.fn().mockResolvedValue('RELEASED'),
      commit: jest.fn(),
      findByOrderId: jest.fn(),
      findExpired: jest.fn(),
    };
    mockLedger = {
      recordMovement: jest.fn().mockResolvedValue(undefined),
      hasMovement: jest.fn().mockResolvedValue(false),
    };
    handler = new ReserveStockHandler(mockStore, mockLedger);
  });
  describe('execute', () => {
    it('should reserve on Redis and record a RESERVED movement', async () => {
      // Arrange
      const inputCommand: ReserveStockCommand = new ReserveStockCommand(
        VALID_PROPS,
      );
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockLedger.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'RESERVED' }),
      );
    });
    it('should succeed without recording twice on an idempotent replay', async () => {
      // Arrange
      mockStore.reserve.mockResolvedValue('ALREADY_RESERVED');
      // Act
      const actualResult: Result<void, DomainError> = await handler.execute(
        new ReserveStockCommand(VALID_PROPS),
      );
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
    it('should fail with InsufficientStockError and record nothing when stock is short', async () => {
      // Arrange
      mockStore.reserve.mockResolvedValue('INSUFFICIENT_STOCK');
      // Act
      const actualResult: Result<void, DomainError> = await handler.execute(
        new ReserveStockCommand(VALID_PROPS),
      );
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InsufficientStockError);
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
    it('should reject a malformed request before touching Redis', async () => {
      // Arrange
      const inputCommand: ReserveStockCommand = new ReserveStockCommand({
        ...VALID_PROPS,
        items: [],
      });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidReservationError);
      expect(mockStore.reserve).not.toHaveBeenCalled();
    });
    it('should release on Redis and rethrow when the ledger write fails', async () => {
      // Arrange
      const expectedError: Error = new Error('check constraint violated');
      mockLedger.recordMovement.mockRejectedValue(expectedError);
      jest
        .spyOn(handler['logger'], 'error')
        .mockImplementation((): void => undefined);
      // Act
      const actualExecution: Promise<Result<void, DomainError>> =
        handler.execute(new ReserveStockCommand(VALID_PROPS));
      // Assert
      await expect(actualExecution).rejects.toBe(expectedError);
      expect(mockStore.release).toHaveBeenCalledTimes(1);
    });
  });
});
