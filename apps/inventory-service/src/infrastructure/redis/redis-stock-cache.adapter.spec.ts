import { RedisService } from '@org/shared-infrastructure';
import { StockCounters } from '../../application/ports/stock-counters.type';
import { RedisStockCacheAdapter } from './redis-stock-cache.adapter';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

describe('RedisStockCacheAdapter', () => {
  let mockRedis: {
    readonly defineCommand: jest.Mock;
    readonly hgetall: jest.Mock;
    readonly warmStock: jest.Mock;
  };
  let adapter: RedisStockCacheAdapter;
  beforeEach(() => {
    mockRedis = {
      defineCommand: jest.fn(),
      hgetall: jest.fn().mockResolvedValue({ total: '100', reserved: '7' }),
      warmStock: jest.fn().mockResolvedValue(1),
    };
    adapter = new RedisStockCacheAdapter(mockRedis as unknown as RedisService);
  });
  it('should register warm_stock.lua, which never sets an expiry', () => {
    // Arrange
    const expectedCommand: string = 'warmStock';
    // Act
    const [actualName, actualDefinition]: [string, { lua: string }] =
      mockRedis.defineCommand.mock.calls[0];
    // Assert
    expect(actualName).toBe(expectedCommand);
    expect(actualDefinition.lua).toContain("redis.call('EXISTS', KEYS[1])");
    expect(actualDefinition.lua).not.toMatch(/EXPIRE|'EX'/);
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
      expect(mockRedis.hgetall).toHaveBeenCalledWith(
        `inventory:stock:${SKU_ID}`,
      );
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
    it('should run warm_stock.lua on the stock hash', async () => {
      // Arrange
      const inputCounters: StockCounters = {
        skuId: SKU_ID,
        totalQuantity: 100,
        reservedQuantity: 7,
      };
      // Act
      await adapter.saveCountersIfAbsent(inputCounters);
      // Assert
      expect(mockRedis.warmStock).toHaveBeenCalledWith(
        1,
        `inventory:stock:${SKU_ID}`,
        100,
        7,
      );
    });
  });
});
