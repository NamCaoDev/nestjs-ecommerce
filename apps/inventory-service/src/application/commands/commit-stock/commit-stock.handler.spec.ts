import { IntegrationEventEnvelope } from '@org/contracts';
import { DomainError, Result } from '@org/shared-domain';
import { InvalidReservationError } from '../../../domain/errors/invalid-reservation.error';
import { StockLedgerRepositoryPort } from '../../../domain/ports/stock-ledger-repository.port';
import { StockReservationStorePort } from '../../../domain/ports/stock-reservation-store.port';
import { ReservationLine } from '../../../domain/value-objects/reservation-line.type';
import { StockReservation } from '../../../domain/value-objects/stock-reservation.vo';
import { InventoryEventPublisherPort } from '../../ports/inventory-event-publisher.port';
import { CommitStockCommand } from './commit-stock.command';
import { StockCacheWarmer } from '../../services/stock-cache-warmer.service';
import { CommitStockHandler } from './commit-stock.handler';

const PLACED_ORDER_ID = '0199a7c0-0000-7000-8000-000000000002';
const EVENT_ITEMS: ReservationLine[] = [
  { skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 3 },
];
const STORED_RESERVATION: StockReservation = StockReservation.create({
  reservationKey: 'c1:checkout-42',
  orderId: '0199a7c0-0000-7000-8000-000000000001',
  items: EVENT_ITEMS,
}).getValue();

/**
 * Builds the command of an `order.placed` event.
 */
const createInputCommand = (): CommitStockCommand =>
  new CommitStockCommand({ orderId: PLACED_ORDER_ID, items: EVENT_ITEMS });

describe('CommitStockHandler', () => {
  let mockStore: jest.Mocked<StockReservationStorePort>;
  let mockLedger: jest.Mocked<StockLedgerRepositoryPort>;
  let mockPublisher: jest.Mocked<InventoryEventPublisherPort>;
  let mockWarmer: { readonly warmSkus: jest.Mock };
  let handler: CommitStockHandler;
  beforeEach(() => {
    mockStore = {
      reserve: jest.fn(),
      release: jest.fn(),
      commit: jest
        .fn()
        .mockResolvedValue({ outcome: 'COMMITTED', isReacquired: false }),
      findByOrderId: jest.fn().mockResolvedValue(STORED_RESERVATION),
      findExpired: jest.fn(),
    };
    mockLedger = {
      recordMovement: jest.fn().mockResolvedValue(undefined),
      hasMovement: jest.fn().mockResolvedValue(false),
    };
    mockPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    mockWarmer = { warmSkus: jest.fn().mockResolvedValue(1) };
    handler = new CommitStockHandler(
      mockStore,
      mockLedger,
      mockPublisher,
      mockWarmer as unknown as StockCacheWarmer,
    );
    jest
      .spyOn(handler['logger'], 'warn')
      .mockImplementation((): void => undefined);
  });
  describe('execute', () => {
    it('should commit the stored reservation for the placed order and record a COMMITTED movement', async () => {
      // Arrange
      const inputCommand: CommitStockCommand = createInputCommand();
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      const actualCommitted: StockReservation =
        mockStore.commit.mock.calls[0][0];
      expect(actualResult.isSuccess).toBe(true);
      expect(actualCommitted.reservationKey).toBe('c1:checkout-42');
      expect(actualCommitted.orderId).toBe(PLACED_ORDER_ID);
      expect(mockLedger.hasMovement).toHaveBeenCalledWith({
        orderId: PLACED_ORDER_ID,
        actionType: 'COMMITTED',
      });
      expect(mockLedger.recordMovement).toHaveBeenCalledWith({
        actionType: 'COMMITTED',
        reservation: actualCommitted,
        isReacquired: false,
      });
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });
    it('should use the event lines under a per-order key when the reservation is gone', async () => {
      // Arrange
      mockStore.findByOrderId.mockResolvedValue(undefined);
      mockStore.commit.mockResolvedValue({
        outcome: 'REACQUIRED_AND_COMMITTED',
        isReacquired: true,
      });
      // Act
      await handler.execute(createInputCommand());
      // Assert
      const actualCommitted: StockReservation =
        mockStore.commit.mock.calls[0][0];
      expect(actualCommitted.reservationKey).toBe(`order:${PLACED_ORDER_ID}`);
      expect(actualCommitted.items).toEqual(EVENT_ITEMS);
      expect(mockLedger.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'COMMITTED',
          isReacquired: true,
        }),
      );
    });
    it.each([
      { outcome: 'ALREADY_COMMITTED', isReacquired: false },
      { outcome: 'ALREADY_COMMITTED', isReacquired: true },
    ])(
      'should reconcile a missing ledger entry on a redelivery (isReacquired=$isReacquired)',
      async ({ outcome, isReacquired }) => {
        // Arrange
        mockStore.commit.mockResolvedValue({
          outcome: outcome as 'ALREADY_COMMITTED',
          isReacquired,
        });
        // Act
        await handler.execute(createInputCommand());
        // Assert
        expect(mockLedger.recordMovement).toHaveBeenCalledWith(
          expect.objectContaining({ actionType: 'COMMITTED', isReacquired }),
        );
      },
    );
    it('should not record twice when the ledger already holds the commit', async () => {
      // Arrange
      mockStore.commit.mockResolvedValue({
        outcome: 'ALREADY_COMMITTED',
        isReacquired: false,
      });
      mockLedger.hasMovement.mockResolvedValue(true);
      // Act
      await handler.execute(createInputCommand());
      // Assert
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
    it('should publish stock.reservation_failed and record nothing when the stock is gone', async () => {
      // Arrange
      mockStore.findByOrderId.mockResolvedValue(undefined);
      mockStore.commit.mockResolvedValue({
        outcome: 'EXPIRED_AND_OUT_OF_STOCK',
        isReacquired: false,
      });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(createInputCommand());
      // Assert
      const actualEvent: IntegrationEventEnvelope<object> =
        mockPublisher.publish.mock.calls[0][0];
      expect(actualResult.isSuccess).toBe(true);
      expect(actualEvent).toMatchObject({
        eventType: 'stock.reservation_failed',
        aggregateId: PLACED_ORDER_ID,
        payload: {
          orderId: PLACED_ORDER_ID,
          items: EVENT_ITEMS,
          reason: 'EXPIRED_OUT_OF_STOCK',
        },
      });
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
    it('should rethrow a failed publication so the order event is redelivered', async () => {
      // Arrange
      const expectedError: Error = new Error('broker down');
      mockStore.commit.mockResolvedValue({
        outcome: 'EXPIRED_AND_OUT_OF_STOCK',
        isReacquired: false,
      });
      mockPublisher.publish.mockRejectedValue(expectedError);
      // Act
      const actualExecution: Promise<Result<void, DomainError>> =
        handler.execute(createInputCommand());
      // Assert
      await expect(actualExecution).rejects.toBe(expectedError);
    });
    it('should reject malformed event lines when there is no stored reservation', async () => {
      // Arrange
      mockStore.findByOrderId.mockResolvedValue(undefined);
      const inputCommand: CommitStockCommand = new CommitStockCommand({
        orderId: PLACED_ORDER_ID,
        items: [],
      });
      // Act
      const actualResult: Result<void, DomainError> =
        await handler.execute(inputCommand);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(InvalidReservationError);
      expect(mockStore.commit).not.toHaveBeenCalled();
    });
    it('should restore cold Redis counters and retry the commit instead of cancelling the order', async () => {
      // Arrange
      mockStore.commit
        .mockResolvedValueOnce({
          outcome: 'STOCK_NOT_LOADED',
          isReacquired: false,
        })
        .mockResolvedValueOnce({ outcome: 'COMMITTED', isReacquired: false });
      // Act
      await handler.execute(createInputCommand());
      // Assert
      expect(mockWarmer.warmSkus).toHaveBeenCalledWith([EVENT_ITEMS[0].skuId]);
      expect(mockPublisher.publish).not.toHaveBeenCalled();
      expect(mockLedger.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'COMMITTED' }),
      );
    });
    it('should report stock.reservation_failed when the SKU is unknown to both stores', async () => {
      // Arrange
      mockStore.commit.mockResolvedValue({
        outcome: 'STOCK_NOT_LOADED',
        isReacquired: false,
      });
      mockWarmer.warmSkus.mockResolvedValue(0);
      // Act
      await handler.execute(createInputCommand());
      // Assert
      expect(mockPublisher.publish).toHaveBeenCalledTimes(1);
      expect(mockLedger.recordMovement).not.toHaveBeenCalled();
    });
  });
});
