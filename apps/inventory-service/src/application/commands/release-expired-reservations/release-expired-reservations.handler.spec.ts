import { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { ReleaseExpiredReservationsCommand } from './release-expired-reservations.command';
import { ReleaseExpiredReservationsHandler } from './release-expired-reservations.handler';
import { ReleaseExpiredReservationsOutput } from './release-expired-reservations.output';

/**
 * Builds a valid reservation under the given key.
 */
const createMockReservation = (reservationKey: string): StockReservation =>
  StockReservation.create({
    reservationKey,
    orderId: '0199a7c0-0000-7000-8000-000000000001',
    items: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 1 }],
  }).getValue();

describe('ReleaseExpiredReservationsHandler', () => {
  let mockStore: jest.Mocked<StockReservationStorePort>;
  let mockLedger: jest.Mocked<StockLedgerRepositoryPort>;
  let handler: ReleaseExpiredReservationsHandler;
  beforeEach(() => {
    mockStore = {
      reserve: jest.fn(),
      release: jest.fn().mockResolvedValue('RELEASED'),
      commit: jest.fn(),
      findByOrderId: jest.fn(),
      findExpired: jest.fn().mockResolvedValue([]),
    };
    mockLedger = {
      recordMovement: jest.fn().mockResolvedValue(undefined),
      hasMovement: jest.fn().mockResolvedValue(false),
    };
    handler = new ReleaseExpiredReservationsHandler(mockStore, mockLedger);
  });
  describe('execute', () => {
    it('should release each expired reservation and record an EXPIRED_RELEASE movement', async () => {
      // Arrange
      const inputReservations: StockReservation[] = [
        createMockReservation('c1:a'),
        createMockReservation('c1:b'),
      ];
      mockStore.findExpired.mockResolvedValue(inputReservations);
      // Act
      const actualOutput: ReleaseExpiredReservationsOutput =
        await handler.execute(
          new ReleaseExpiredReservationsCommand({ batchSize: 100 }),
        );
      // Assert
      expect(actualOutput).toEqual({ expiredCount: 2, releasedCount: 2 });
      expect(mockStore.findExpired).toHaveBeenCalledWith(100);
      expect(mockLedger.recordMovement).toHaveBeenCalledWith({
        actionType: 'EXPIRED_RELEASE',
        reservation: inputReservations[0],
      });
      expect(mockLedger.recordMovement).toHaveBeenCalledTimes(2);
    });
    it('should not record reservations committed or released concurrently', async () => {
      // Arrange
      mockStore.findExpired.mockResolvedValue([createMockReservation('c1:a')]);
      mockStore.release.mockResolvedValue('NOT_FOUND');
      // Act
      const actualOutput: ReleaseExpiredReservationsOutput =
        await handler.execute(
          new ReleaseExpiredReservationsCommand({ batchSize: 100 }),
        );
      // Assert
      expect(actualOutput).toEqual({ expiredCount: 1, releasedCount: 0 });
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
  });
});
