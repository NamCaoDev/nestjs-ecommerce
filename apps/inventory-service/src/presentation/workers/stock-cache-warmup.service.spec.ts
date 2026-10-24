import { CommandBus } from '@nestjs/cqrs';
import { WarmUpStockCacheCommand } from '../../application/commands/warm-up-stock-cache/warm-up-stock-cache.command';
import { StockCacheWarmupService } from './stock-cache-warmup.service';

describe('StockCacheWarmupService', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let service: StockCacheWarmupService;
  beforeEach(() => {
    mockCommandBus = {
      execute: jest
        .fn()
        .mockResolvedValue({ scannedCount: 3, restoredCount: 1 }),
    };
    service = new StockCacheWarmupService(
      mockCommandBus as unknown as CommandBus,
    );
    jest
      .spyOn(service['logger'], 'log')
      .mockImplementation((): void => undefined);
    jest
      .spyOn(service['logger'], 'error')
      .mockImplementation((): void => undefined);
  });
  afterEach(() => {
    delete process.env['STOCK_CACHE_WARMUP_ENABLED'];
  });
  it('should warm the cache at startup in pages of 500', async () => {
    // Arrange
    const expectedBatchSize: number = 500;
    // Act
    await service.onApplicationBootstrap();
    // Assert
    const actualCommand: WarmUpStockCacheCommand =
      mockCommandBus.execute.mock.calls[0][0];
    expect(actualCommand.batchSize).toBe(expectedBatchSize);
    expect(service['logger'].log).toHaveBeenCalledWith(
      expect.stringContaining('1/3 SKU(s) restored'),
    );
  });
  it('should log, not crash the startup, when the warm-up fails', async () => {
    // Arrange
    mockCommandBus.execute.mockRejectedValue(new Error('database down'));
    // Act
    await service.onApplicationBootstrap();
    // Assert
    expect(service['logger'].error).toHaveBeenCalledWith(
      expect.stringContaining('database down'),
    );
  });
  it('should skip the warm-up when STOCK_CACHE_WARMUP_ENABLED is false', async () => {
    // Arrange
    process.env['STOCK_CACHE_WARMUP_ENABLED'] = 'false';
    // Act
    await service.onApplicationBootstrap();
    // Assert
    expect(mockCommandBus.execute).not.toHaveBeenCalled();
  });
});
