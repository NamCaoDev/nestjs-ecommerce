import { NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetStockBySkuQuery } from '../../application/queries/get-stock-by-sku/get-stock-by-sku.query';
import { GetStockLedgerQuery } from '../../application/queries/get-stock-ledger/get-stock-ledger.query';
import { StockLevelReadModel } from '../../application/read-models/stock-level.read-model';
import { InventoryHttpController } from './inventory-http.controller';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

describe('InventoryHttpController', () => {
  let mockQueryBus: { readonly execute: jest.Mock };
  let controller: InventoryHttpController;
  beforeEach(() => {
    mockQueryBus = { execute: jest.fn() };
    controller = new InventoryHttpController(
      mockQueryBus as unknown as QueryBus,
    );
  });
  describe('getStock', () => {
    it('should dispatch GetStockBySkuQuery and return the stock', async () => {
      // Arrange
      const expectedStock: StockLevelReadModel = {
        skuId: SKU_ID,
        totalQuantity: 10,
        reservedQuantity: 2,
        availableQuantity: 8,
        source: 'REDIS',
      };
      mockQueryBus.execute.mockResolvedValue(expectedStock);
      // Act
      const actualStock: StockLevelReadModel =
        await controller.getStock(SKU_ID);
      // Assert
      const actualQuery: GetStockBySkuQuery =
        mockQueryBus.execute.mock.calls[0][0];
      expect(actualQuery).toBeInstanceOf(GetStockBySkuQuery);
      expect(actualQuery.skuId).toBe(SKU_ID);
      expect(actualStock).toBe(expectedStock);
    });
    it('should answer 404 for an unknown SKU', async () => {
      // Arrange
      mockQueryBus.execute.mockResolvedValue(undefined);
      // Act
      const actualCall: Promise<StockLevelReadModel> =
        controller.getStock(SKU_ID);
      // Assert
      await expect(actualCall).rejects.toBeInstanceOf(NotFoundException);
    });
  });
  describe('getLedger', () => {
    it('should dispatch GetStockLedgerQuery', async () => {
      // Arrange
      mockQueryBus.execute.mockResolvedValue([]);
      // Act
      await controller.getLedger(SKU_ID);
      // Assert
      expect(mockQueryBus.execute.mock.calls[0][0]).toBeInstanceOf(
        GetStockLedgerQuery,
      );
    });
  });
  describe('getSmokeTest', () => {
    it('should report the service as ok', () => {
      // Arrange
      const expectedService: string = 'inventory-service';
      // Act
      const actualResponse: { service: string } = controller.getSmokeTest();
      // Assert
      expect(actualResponse.service).toBe(expectedService);
    });
  });
});
