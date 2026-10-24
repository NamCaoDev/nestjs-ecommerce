import { StockCachePort } from '../ports/stock-cache.port';
import { StockCounters } from '../ports/stock-counters.type';
import { StockReadPort } from '../ports/stock-read.port';
import { StockCacheWarmer } from './stock-cache-warmer.service';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';
const COUNTERS: StockCounters = {
  skuId: SKU_ID,
  totalQuantity: 100,
  reservedQuantity: 4,
};

describe('StockCacheWarmer', () => {
  let mockCache: jest.Mocked<StockCachePort>;
  let mockRead: jest.Mocked<StockReadPort>;
  let warmer: StockCacheWarmer;
  beforeEach(() => {
    mockCache = {
      findCounters: jest.fn(),
      saveCountersIfAbsent: jest.fn(),
      saveManyCountersIfAbsent: jest.fn().mockResolvedValue(1),
      applyRestock: jest.fn(),
    };
    mockRead = {
      findCounters: jest.fn(),
      findLedger: jest.fn(),
      findCountersBySkuIds: jest.fn().mockResolvedValue([COUNTERS]),
      findCountersPage: jest.fn(),
    };
    warmer = new StockCacheWarmer(mockCache, mockRead);
  });
  it('should restore the stored counters of the requested SKUs, deduplicated', async () => {
    // Arrange
    const inputSkuIds: string[] = [SKU_ID, SKU_ID];
    // Act
    const actualRestored: number = await warmer.warmSkus(inputSkuIds);
    // Assert
    expect(actualRestored).toBe(1);
    expect(mockRead.findCountersBySkuIds).toHaveBeenCalledWith([SKU_ID]);
    expect(mockCache.saveManyCountersIfAbsent).toHaveBeenCalledWith([COUNTERS]);
  });
  it('should not touch Redis when PostgreSQL knows none of the SKUs', async () => {
    // Arrange
    mockRead.findCountersBySkuIds.mockResolvedValue([]);
    // Act
    const actualRestored: number = await warmer.warmSkus([SKU_ID]);
    // Assert
    expect(actualRestored).toBe(0);
    expect(mockCache.saveManyCountersIfAbsent).not.toHaveBeenCalled();
  });
});
