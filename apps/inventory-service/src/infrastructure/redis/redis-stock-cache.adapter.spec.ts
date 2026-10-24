import { RedisService } from '@org/shared-infrastructure';
import { RestockApplyOutcome } from '../../application/ports/restock-apply-outcome.type';
import { StockCounters } from '../../application/ports/stock-counters.type';
import { StockSnapshot } from '../../application/ports/stock-snapshot.type';
import { RedisStockCacheAdapter } from './redis-stock-cache.adapter';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';
const SNAPSHOT: StockSnapshot = {
  skuId: SKU_ID,
  totalQuantity: 100,
  reservedQuantity: 7,
  pendingRestockEventIds: ['e1', 'e2'],
};

describe('RedisStockCacheAdapter', () => {
  let mockRedis: {
    readonly defineCommand: jest.Mock;
    readonly hgetall: jest.Mock;
    readonly warmStock: jest.Mock;
    readonly applyRestock: jest.Mock;
    readonly pipeline: jest.Mock;
  };
  let adapter: RedisStockCacheAdapter;
  beforeEach(() => {
    mockRedis = {
      defineCommand: jest.fn(),
      hgetall: jest.fn().mockResolvedValue({ total: '100', reserved: '7' }),
      warmStock: jest.fn().mockResolvedValue(1),
      applyRestock: jest.fn().mockResolvedValue(1),
      pipeline: jest.fn(),
    };
    adapter = new RedisStockCacheAdapter(mockRedis as unknown as RedisService);
  });
  it('should register warm_stock.lua (no expiry on the hash) and apply_restock.lua', () => {
    // Arrange
    const expectedNames: string[] = ['warmStock', 'applyRestock'];
    // Act
    const actualNames: string[] = mockRedis.defineCommand.mock.calls.map(
      (call: unknown[]): string => call[0] as string,
    );
    // Assert
    expect(actualNames).toEqual(expectedNames);
    expect(mockRedis.defineCommand.mock.calls[0][1].lua).toContain(
      "redis.call('HSET', KEYS[1]",
    );
    expect(mockRedis.defineCommand.mock.calls[0][1].lua).not.toMatch(/EXPIRE/);
    expect(mockRedis.defineCommand.mock.calls[1][1].lua).toContain(
      "redis.call('HINCRBY', KEYS[1], 'total'",
    );
  });
  describe('findCounters', () => {
    it('should read the stock hash', async () => {
      // Arrange
      const expectedCounters: StockCounters = {
        skuId: SKU_ID,
        totalQuantity: 100,
        reservedQuantity: 7,
      };
      // Act
      const actualCounters: StockCounters | undefined =
        await adapter.findCounters(SKU_ID);
      // Assert
      expect(actualCounters).toEqual(expectedCounters);
    });
    it('should return undefined when the hash is missing', async () => {
      // Arrange
      mockRedis.hgetall.mockResolvedValue({});
      // Act
      const actualCounters: StockCounters | undefined =
        await adapter.findCounters(SKU_ID);
      // Assert
      expect(actualCounters).toBeUndefined();
    });
  });
  describe('saveCountersIfAbsent', () => {
    it('should restore the hash and mark the pending receipts of the snapshot as applied', async () => {
      // Arrange
      const inputSnapshot: StockSnapshot = SNAPSHOT;
      // Act
      await adapter.saveCountersIfAbsent(inputSnapshot);
      // Assert
      expect(mockRedis.warmStock).toHaveBeenCalledWith(
        3,
        `inventory:stock:${SKU_ID}`,
        'inventory:applied_restock:e1',
        'inventory:applied_restock:e2',
        100,
        7,
        2_592_000,
      );
    });
  });
  describe('saveManyCountersIfAbsent', () => {
    it('should run one pipeline and count the restored entries', async () => {
      // Arrange
      const mockPipeline: {
        readonly warmStock: jest.Mock;
        readonly exec: jest.Mock;
      } = {
        warmStock: jest.fn(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 0],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);
      // Act
      const actualRestored: number = await adapter.saveManyCountersIfAbsent([
        SNAPSHOT,
        { ...SNAPSHOT, skuId: 'other', pendingRestockEventIds: [] },
      ]);
      // Assert
      expect(actualRestored).toBe(1);
      expect(mockPipeline.warmStock).toHaveBeenCalledTimes(2);
      expect(mockPipeline.warmStock).toHaveBeenLastCalledWith(
        1,
        'inventory:stock:other',
        100,
        7,
        2_592_000,
      );
    });
    it('should throw when a script in the pipeline fails', async () => {
      // Arrange
      mockRedis.pipeline.mockReturnValue({
        warmStock: jest.fn(),
        exec: jest.fn().mockResolvedValue([[new Error('NOSCRIPT'), null]]),
      });
      // Act
      const actualCall: Promise<number> = adapter.saveManyCountersIfAbsent([
        SNAPSHOT,
      ]);
      // Assert
      await expect(actualCall).rejects.toThrow('NOSCRIPT');
    });
  });
  describe('applyRestock', () => {
    it.each([
      { inputReply: 1, expectedOutcome: 'APPLIED' },
      { inputReply: 2, expectedOutcome: 'ALREADY_APPLIED' },
      { inputReply: 0, expectedOutcome: 'SKU_NOT_CACHED' },
    ])(
      'should map reply $inputReply to $expectedOutcome',
      async ({ inputReply, expectedOutcome }) => {
        // Arrange
        mockRedis.applyRestock.mockResolvedValue(inputReply);
        // Act
        const actualOutcome: RestockApplyOutcome = await adapter.applyRestock({
          eventId: 'e1',
          skuId: SKU_ID,
          quantity: 50,
        });
        // Assert
        expect(actualOutcome).toBe(expectedOutcome);
        expect(mockRedis.applyRestock).toHaveBeenCalledWith(
          2,
          `inventory:stock:${SKU_ID}`,
          'inventory:applied_restock:e1',
          50,
          2_592_000,
        );
      },
    );
  });
});
