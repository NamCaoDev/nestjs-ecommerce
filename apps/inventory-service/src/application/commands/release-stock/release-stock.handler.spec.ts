import { DomainError, Result } from '@org/shared-domain';
import { InvalidReservationError } from '../../../domain/errors/invalid-reservation.error';
import { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { StockCommandProps } from '../stock-command.props';
import { ReleaseStockCommand } from './release-stock.command';
import { ReleaseStockHandler } from './release-stock.handler';

const VALID_PROPS: StockCommandProps = {
  reservationKey: '0199a7c0-0000-7000-8000-0000000000c1:checkout-42',
  orderId: '0199a7c0-0000-7000-8000-000000000001',
  items: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 2 }],
};

describe('ReleaseStockHandler', () => {
  let mockStore: jest.Mocked<StockReservationStorePort>;
  let mockLedger: jest.Mocked<StockLedgerRepositoryPort>;
  let handler: ReleaseStockHandler;
  beforeEach(() => {
    mockStore = {
      reserve: jest.fn(),
      release: jest.fn().mockResolvedValue('RELEASED'),
      commit: jest.fn(),
      findByOrderId: jest.fn(),
      findExpired: jest.fn(),
    };
    mockLedger = {
      recordMovement: jest.fn().mockResolvedValue(undefined),
      hasMovement: jest.fn().mockResolvedValue(false),
    };
    handler = new ReleaseStockHandler(mockStore, mockLedger);
  });
  describe('execute', () => {
    it('should release on Redis and record a RELEASED movement', async () => {
      // Arrange
      const inputCommand: ReleaseStockCommand = new ReleaseStockCommand(
        VALID_PROPS,
      );
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockLedger.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'RELEASED' }),
      );
    });
    it('should succeed without recording when nothing was held under the key', async () => {
      // Arrange
      mockStore.release.mockResolvedValue('NOT_FOUND');
      // Act
      const actualResult: Result<void, DomainError> = await handler.execute(
        new ReleaseStockCommand(VALID_PROPS),
      );
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
    it('should reject a malformed request', async () => {
      // Arrange
      const inputCommand: ReleaseStockCommand = new ReleaseStockCommand({
        ...VALID_PROPS,
        orderId: 'order-1',
      });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidReservationError);
      expect(mockStore.release).not.toHaveBeenCalled();
    });
  });
});
