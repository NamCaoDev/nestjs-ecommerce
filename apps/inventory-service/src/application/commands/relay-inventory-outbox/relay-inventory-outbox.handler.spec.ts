import { InventoryOutboxPort } from '../../ports/inventory-outbox.port';
import { OutboxRecord } from '../../ports/outbox-record.type';
import { StockCachePort } from '../../ports/stock-cache.port';
import { RelayInventoryOutboxCommand } from './relay-inventory-outbox.command';
import { RelayInventoryOutboxHandler } from './relay-inventory-outbox.handler';
import { RelayInventoryOutboxOutput } from './relay-inventory-outbox.output';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

/**
 * Builds a pending `stock.restocked` event.
 */
const createMockEvent = (
  id: string,
  eventType: string = 'stock.restocked',
): OutboxRecord => ({
  id,
  aggregateId: SKU_ID,
  eventType,
  payload: { skuId: SKU_ID, additionalQuantity: 50 },
  occurredAt: 1,
  retryCount: 0,
});

describe('RelayInventoryOutboxHandler', () => {
  let mockOutbox: jest.Mocked<InventoryOutboxPort>;
  let mockCache: jest.Mocked<StockCachePort>;
  let handler: RelayInventoryOutboxHandler;
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000 });
    mockOutbox = {
      claimPendingBatch: jest
        .fn()
        .mockResolvedValue([createMockEvent('e1'), createMockEvent('e2')]),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    mockCache = {
      findCounters: jest.fn(),
      saveCountersIfAbsent: jest.fn(),
      saveManyCountersIfAbsent: jest.fn(),
      applyRestock: jest.fn().mockResolvedValue('APPLIED'),
    };
    handler = new RelayInventoryOutboxHandler(mockOutbox, mockCache);
    jest
      .spyOn(handler['logger'], 'warn')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  it('should apply each receipt once (keyed by event id) and publish them', async () => {
    // Arrange
    const expectedOutput: RelayInventoryOutboxOutput = {
      publishedCount: 2,
      failedCount: 0,
    };
    // Act
    const actualOutput: RelayInventoryOutboxOutput = await handler.execute(
      new RelayInventoryOutboxCommand({ batchSize: 50 }),
    );
    // Assert
    expect(actualOutput).toEqual(expectedOutput);
    expect(mockCache.applyRestock).toHaveBeenNthCalledWith(1, {
      eventId: 'e1',
      skuId: SKU_ID,
      quantity: 50,
    });
    expect(mockOutbox.markPublished).toHaveBeenCalledWith({
      ids: ['e1', 'e2'],
      publishedAt: 1_000,
    });
    expect(mockOutbox.markFailed).not.toHaveBeenCalled();
  });
  it.each(['ALREADY_APPLIED', 'SKU_NOT_CACHED'])(
    'should publish an event whose outcome is %s',
    async (inputOutcome: string) => {
      // Arrange
      mockCache.applyRestock.mockResolvedValue(
        inputOutcome as 'ALREADY_APPLIED',
      );
      // Act
      const actualOutput: RelayInventoryOutboxOutput = await handler.execute(
        new RelayInventoryOutboxCommand({ batchSize: 50 }),
      );
      // Assert
      expect(actualOutput.publishedCount).toBe(2);
    },
  );
  it('should publish what was applied and return the rest to PENDING when Redis fails mid-batch', async () => {
    // Arrange
    mockCache.applyRestock
      .mockResolvedValueOnce('APPLIED')
      .mockRejectedValueOnce(new Error('Connection is closed.'));
    // Act
    const actualOutput: RelayInventoryOutboxOutput = await handler.execute(
      new RelayInventoryOutboxCommand({ batchSize: 50 }),
    );
    // Assert
    expect(actualOutput).toEqual({ publishedCount: 1, failedCount: 1 });
    expect(mockOutbox.markPublished).toHaveBeenCalledWith({
      ids: ['e1'],
      publishedAt: 1_000,
    });
    expect(mockOutbox.markFailed).toHaveBeenCalledWith({
      ids: ['e2'],
      error: 'Connection is closed.',
    });
  });
  it('should leave an unknown event type pending rather than drop it', async () => {
    // Arrange
    mockOutbox.claimPendingBatch.mockResolvedValue([
      createMockEvent('e9', 'stock.unknown'),
    ]);
    // Act
    const actualOutput: RelayInventoryOutboxOutput = await handler.execute(
      new RelayInventoryOutboxCommand({ batchSize: 50 }),
    );
    // Assert
    expect(actualOutput).toEqual({ publishedCount: 0, failedCount: 1 });
    expect(mockCache.applyRestock).not.toHaveBeenCalled();
    expect(mockOutbox.markFailed).toHaveBeenCalledWith({
      ids: ['e9'],
      error: 'No handler for outbox event type stock.unknown',
    });
  });
});
