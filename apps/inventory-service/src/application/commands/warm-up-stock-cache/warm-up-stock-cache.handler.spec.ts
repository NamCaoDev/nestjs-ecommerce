import { StockCachePort } from '../../ports/stock-cache.port';
import { StockCounters } from '../../ports/stock-counters.type';
import { StockReadPort } from '../../ports/stock-read.port';
import { WarmUpStockCacheCommand } from './warm-up-stock-cache.command';
import { WarmUpStockCacheHandler } from './warm-up-stock-cache.handler';
import { WarmUpStockCacheOutput } from './warm-up-stock-cache.output';

/**
 * Builds counters for SKU `sku-{index}`.
 */
const createCounters = (index: number): StockCounters => ({
  skuId: `sku-${index}`,
  totalQuantity: 10,
  reservedQuantity: 0,
});

describe('WarmUpStockCacheHandler', () => {
  it('should page through every SKU by keyset and sum the restored entries', async () => {
    // Arrange
    const mockRead: jest.Mocked<StockReadPort> = {
      findCounters: jest.fn(),
      findLedger: jest.fn(),
      findCountersBySkuIds: jest.fn(),
      findCountersPage: jest
        .fn()
        .mockResolvedValueOnce([createCounters(1), createCounters(2)])
        .mockResolvedValueOnce([createCounters(3)]),
    };
    const mockCache: jest.Mocked<StockCachePort> = {
      findCounters: jest.fn(),
      saveCountersIfAbsent: jest.fn(),
      saveManyCountersIfAbsent: jest
        .fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0),
      applyRestock: jest.fn(),
    };
    const handler: WarmUpStockCacheHandler = new WarmUpStockCacheHandler(
      mockCache,
      mockRead,
    );
    // Act
    const actualOutput: WarmUpStockCacheOutput = await handler.execute(
      new WarmUpStockCacheCommand({ batchSize: 2 }),
    );
    // Assert
    expect(actualOutput).toEqual({ scannedCount: 3, restoredCount: 2 });
    expect(mockRead.findCountersPage).toHaveBeenNthCalledWith(1, {
      afterSkuId: undefined,
      limit: 2,
    });
    expect(mockRead.findCountersPage).toHaveBeenNthCalledWith(2, {
      afterSkuId: 'sku-2',
      limit: 2,
    });
  });
});
