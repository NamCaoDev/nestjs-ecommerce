import { DomainError, Result } from '@org/shared-domain';
import { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { ReleaseOrderStockCommand } from './release-order-stock.command';
import { ReleaseOrderStockHandler } from './release-order-stock.handler';

const ORDER_ID = '0199a7c0-0000-7000-8000-000000000001';
const STORED_RESERVATION: StockReservation = StockReservation.create({
  reservationKey: '0199a7c0-0000-7000-8000-0000000000c1:checkout-42',
  orderId: ORDER_ID,
  items: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 2 }],
}).getValue();

describe('ReleaseOrderStockHandler', () => {
  let mockStore: jest.Mocked<StockReservationStorePort>;
  let mockLedger: jest.Mocked<StockLedgerRepositoryPort>;
  let handler: ReleaseOrderStockHandler;
  beforeEach(() => {
    mockStore = {
      reserve: jest.fn(),
      release: jest.fn().mockResolvedValue('RELEASED'),
      commit: jest.fn(),
      findByOrderId: jest.fn().mockResolvedValue(STORED_RESERVATION),
      findExpired: jest.fn(),
    };
    mockLedger = {
      recordMovement: jest.fn().mockResolvedValue(undefined),
      hasMovement: jest.fn(),
    };
    handler = new ReleaseOrderStockHandler(mockStore, mockLedger);
  });
  describe('execute', () => {
    it("should release the order's reservation and record a RELEASED movement", async () => {
      // Arrange
      const inputCommand: ReleaseOrderStockCommand =
        new ReleaseOrderStockCommand({ orderId: ORDER_ID });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockStore.findByOrderId).toHaveBeenCalledWith(ORDER_ID);
      expect(mockStore.release).toHaveBeenCalledWith(STORED_RESERVATION);
      expect(mockLedger.recordMovement).toHaveBeenCalledWith({
        actionType: 'RELEASED',
        reservation: STORED_RESERVATION,
      });
    });
    it('should succeed without effect when the order holds no reservation', async () => {
      // Arrange
      mockStore.findByOrderId.mockResolvedValue(undefined);
      // Act
      const actualResult: Result<void, DomainError> = await handler.execute(
        new ReleaseOrderStockCommand({ orderId: ORDER_ID }),
      );
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockStore.release).not.toHaveBeenCalled();
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
    it('should not record a movement when the reservation was already released or committed', async () => {
      // Arrange
      mockStore.release.mockResolvedValue('NOT_FOUND');
      // Act
      const actualResult: Result<void, DomainError> = await handler.execute(
        new ReleaseOrderStockCommand({ orderId: ORDER_ID }),
      );
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
  });
});
