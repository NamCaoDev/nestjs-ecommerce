import { StockCounters } from '../../../application/ports/stock-counters.type';
import { StockLedgerEntryReadModel } from '../../../application/read-models/stock-ledger-entry.read-model';
import { PrismaService } from '../prisma/prisma.service';
import { StockReadPrismaRepository } from './stock-read.prisma.repository';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

describe('StockReadPrismaRepository', () => {
  let mockClient: {
    readonly inventoryStock: { readonly findUnique: jest.Mock };
    readonly stockLedger: { readonly findMany: jest.Mock };
  };
  let repository: StockReadPrismaRepository;
  beforeEach(() => {
    mockClient = {
      inventoryStock: {
        findUnique: jest.fn().mockResolvedValue({
          skuId: SKU_ID,
          totalQuantity: 100,
          reservedQuantity: 7,
          version: 3,
        }),
      },
      stockLedger: { findMany: jest.fn().mockResolvedValue([]) },
    };
    repository = new StockReadPrismaRepository({
      client: mockClient,
    } as unknown as PrismaService);
  });
  describe('findCounters', () => {
    it('should map the stock row', async () => {
      // Arrange
      const expectedCounters: StockCounters = {
        skuId: SKU_ID,
        totalQuantity: 100,
        reservedQuantity: 7,
      };
      // Act
      const actualCounters: StockCounters | undefined =
        await repository.findCounters(SKU_ID);
      // Assert
      expect(actualCounters).toEqual(expectedCounters);
    });
    it('should return undefined for an unknown SKU', async () => {
      // Arrange
      mockClient.inventoryStock.findUnique.mockResolvedValue(null);
      // Act
      const actualCounters: StockCounters | undefined =
        await repository.findCounters(SKU_ID);
      // Assert
      expect(actualCounters).toBeUndefined();
    });
  });
  describe('findLedger', () => {
    it('should read the newest entries first and map them', async () => {
      // Arrange
      mockClient.stockLedger.findMany.mockResolvedValue([
        {
          id: 'l1',
          skuId: SKU_ID,
          actionType: 'COMMITTED',
          quantityChanged: -2,
          orderId: 'o1',
          reservationKey: 'c1:k',
          createdAt: new Date(Date.UTC(2026, 9, 24)),
        },
      ]);
      // Act
      const actualEntries: StockLedgerEntryReadModel[] =
        await repository.findLedger({ skuId: SKU_ID, limit: 50 });
      // Assert
      expect(mockClient.stockLedger.findMany).toHaveBeenCalledWith({
        where: { skuId: SKU_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
      expect(actualEntries).toEqual([
        {
          id: 'l1',
          skuId: SKU_ID,
          actionType: 'COMMITTED',
          quantityChanged: -2,
          orderId: 'o1',
          reservationKey: 'c1:k',
          createdAt: Date.UTC(2026, 9, 24),
        },
      ]);
    });
  });
});
