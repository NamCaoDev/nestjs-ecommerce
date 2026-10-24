import { NotFoundException } from '@nestjs/common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { RestockSkuCommand } from '../../application/commands/restock-sku/restock-sku.command';
import { DuplicateRequestError } from '../../application/errors/duplicate-request.error';
import { InvalidRestockError } from '../../domain/errors/invalid-restock.error';
import { GetStockBySkuQuery } from '../../application/queries/get-stock-by-sku/get-stock-by-sku.query';
import { GetStockLedgerQuery } from '../../application/queries/get-stock-ledger/get-stock-ledger.query';
import { StockLevelReadModel } from '../../application/read-models/stock-level.read-model';
import { InventoryHttpController } from './inventory-http.controller';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

describe('InventoryHttpController', () => {
  let mockQueryBus: { readonly execute: jest.Mock };
  let mockCommandBus: { readonly execute: jest.Mock };
  let controller: InventoryHttpController;
  beforeEach(() => {
    mockQueryBus = { execute: jest.fn() };
    mockCommandBus = { execute: jest.fn() };
    controller = new InventoryHttpController(
      mockQueryBus as unknown as QueryBus,
      mockCommandBus as unknown as CommandBus,
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
  describe('restock', () => {
    it('should dispatch RestockSkuCommand with the Idempotency-Key and return the new level', async () => {
      // Arrange
      const expectedStock: StockLevelReadModel = {
        skuId: SKU_ID,
        totalQuantity: 150,
        reservedQuantity: 0,
        availableQuantity: 150,
        source: 'DATABASE',
      };
      mockCommandBus.execute.mockResolvedValue(Result.ok(expectedStock));
      // Act
      const actualStock: StockLevelReadModel = await controller.restock(
        'receipt-1',
        {
          skuId: SKU_ID,
          quantity: 50,
          note: 'PO-1',
        },
      );
      // Assert
      const actualCommand: RestockSkuCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualCommand).toMatchObject({
        skuId: SKU_ID,
        additionalQuantity: 50,
        referenceNote: 'PO-1',
        idempotencyKey: 'receipt-1',
      });
      expect(actualStock).toBe(expectedStock);
    });
    it.each([
      {
        inputError: new DuplicateRequestError('receipt-1'),
        expectedType: ConflictException,
      },
      {
        inputError: new InvalidRestockError('quantity'),
        expectedType: BadRequestException,
      },
    ])(
      'should map $inputError.code to $expectedType.name',
      async ({ inputError, expectedType }) => {
        // Arrange
        mockCommandBus.execute.mockResolvedValue(Result.fail(inputError));
        // Act
        const actualCall: Promise<StockLevelReadModel> = controller.restock(
          'receipt-1',
          {
            skuId: SKU_ID,
            quantity: 1,
          },
        );
        // Assert
        await expect(actualCall).rejects.toBeInstanceOf(expectedType);
      },
    );
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
