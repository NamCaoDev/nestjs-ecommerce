import { StockCachePort } from '../../ports/stock-cache.port';
import { StockCounters } from '../../ports/stock-counters.type';
import { StockReadPort } from '../../ports/stock-read.port';
import { StockLevelReadModel } from '../../read-models/stock-level.read-model';
import { GetStockBySkuHandler } from './get-stock-by-sku.handler';
import { GetStockBySkuQuery } from './get-stock-by-sku.query';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';
const COUNTERS: StockCounters = {
  skuId: SKU_ID,
  totalQuantity: 100,
  reservedQuantity: 7,
};

describe('GetStockBySkuHandler', () => {
  let mockCache: jest.Mocked<StockCachePort>;
  let mockRead: jest.Mocked<StockReadPort>;
  let handler: GetStockBySkuHandler;
  beforeEach(() => {
    mockCache = {
      findCounters: jest.fn().mockResolvedValue(COUNTERS),
      saveCountersIfAbsent: jest.fn().mockResolvedValue(undefined),
      saveManyCountersIfAbsent: jest.fn(),
      applyRestock: jest.fn(),
    };
    mockRead = {
      findCounters: jest.fn().mockResolvedValue(COUNTERS),
      findLedger: jest.fn(),
      findCountersBySkuIds: jest.fn(),
      findCountersPage: jest.fn(),
    };
    handler = new GetStockBySkuHandler(mockCache, mockRead);
  });
  it('should serve the Redis counters with the available quantity', async () => {
    // Arrange
    const expectedStock: StockLevelReadModel = {
      ...COUNTERS,
      availableQuantity: 93,
      source: 'REDIS',
    };
    // Act
    const actualStock: StockLevelReadModel | undefined = await handler.execute(
      new GetStockBySkuQuery({ skuId: SKU_ID }),
    );
    // Assert
    expect(actualStock).toEqual(expectedStock);
    expect(mockRead.findCounters).not.toHaveBeenCalled();
  });
  it('should fall back to PostgreSQL and restore the Redis counters when Redis has no entry', async () => {
    // Arrange
    mockCache.findCounters.mockResolvedValue(undefined);
    // Act
    const actualStock: StockLevelReadModel | undefined = await handler.execute(
      new GetStockBySkuQuery({ skuId: SKU_ID }),
    );
    // Assert
    expect(actualStock).toMatchObject({
      availableQuantity: 93,
      source: 'DATABASE',
    });
    expect(mockCache.saveCountersIfAbsent).toHaveBeenCalledWith(COUNTERS);
  });
  it('should return undefined for a SKU unknown to both stores', async () => {
    // Arrange
    mockCache.findCounters.mockResolvedValue(undefined);
    mockRead.findCounters.mockResolvedValue(undefined);
    // Act
    const actualStock: StockLevelReadModel | undefined = await handler.execute(
      new GetStockBySkuQuery({ skuId: SKU_ID }),
    );
    // Assert
    expect(actualStock).toBeUndefined();
    expect(mockCache.saveCountersIfAbsent).not.toHaveBeenCalled();
  });
});
