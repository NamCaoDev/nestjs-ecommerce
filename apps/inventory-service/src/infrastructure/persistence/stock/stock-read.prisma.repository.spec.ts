import { StockSnapshot } from '../../../application/ports/stock-snapshot.type';
import { StockLedgerEntryReadModel } from '../../../application/read-models/stock-ledger-entry.read-model';
import { PrismaService } from '../prisma/prisma.service';
import { StockReadPrismaRepository } from './stock-read.prisma.repository';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';
const STOCK_ROW: Record<string, unknown> = {
  skuId: SKU_ID,
  totalQuantity: 100,
  reservedQuantity: 7,
  version: 3,
};

describe('StockReadPrismaRepository', () => {
  let mockTransaction: {
    readonly inventoryStock: { readonly findMany: jest.Mock };
    readonly outboxEvent: { readonly findMany: jest.Mock };
  };
  let mockClient: {
    readonly $transaction: jest.Mock;
    readonly stockLedger: { readonly findMany: jest.Mock };
  };
  let repository: StockReadPrismaRepository;
  beforeEach(() => {
    mockTransaction = {
      inventoryStock: { findMany: jest.fn().mockResolvedValue([STOCK_ROW]) },
      outboxEvent: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'e1', aggregateId: SKU_ID }]),
      },
    };
    mockClient = {
      $transaction: jest.fn(
        (work: (transaction: typeof mockTransaction) => Promise<unknown>) =>
          work(mockTransaction),
      ),
      stockLedger: { findMany: jest.fn().mockResolvedValue([]) },
    };
    repository = new StockReadPrismaRepository({
      client: mockClient,
    } as unknown as PrismaService);
  });
  describe('findCounters', () => {
    it('should read the counters with their pending receipts in one REPEATABLE READ snapshot', async () => {
      // Arrange
      const expectedSnapshot: StockSnapshot = {
        skuId: SKU_ID,
        totalQuantity: 100,
        reservedQuantity: 7,
        pendingRestockEventIds: ['e1'],
      };
      // Act
      const actualSnapshot: StockSnapshot | undefined =
        await repository.findCounters(SKU_ID);
      // Assert
      expect(actualSnapshot).toEqual(expectedSnapshot);
      expect(mockClient.$transaction.mock.calls[0][1]).toEqual({
        isolationLevel: 'RepeatableRead',
      });
      expect(mockTransaction.outboxEvent.findMany).toHaveBeenCalledWith({
        where: {
          eventType: 'stock.restocked',
          status: { not: 'PUBLISHED' },
          aggregateId: { in: [SKU_ID] },
        },
        select: { id: true, aggregateId: true },
      });
    });
    it('should return undefined for an unknown SKU without querying the outbox', async () => {
      // Arrange
      mockTransaction.inventoryStock.findMany.mockResolvedValue([]);
      // Act
      const actualSnapshot: StockSnapshot | undefined =
        await repository.findCounters(SKU_ID);
      // Assert
      expect(actualSnapshot).toBeUndefined();
      expect(mockTransaction.outboxEvent.findMany).not.toHaveBeenCalled();
    });
  });
  describe('findCountersPage', () => {
    it('should page by SKU id after the previous key', async () => {
      // Arrange
      const inputAfterSkuId: string = '0199a7c0-0000-7000-8000-000000000100';
      // Act
      await repository.findCountersPage({
        afterSkuId: inputAfterSkuId,
        limit: 500,
      });
      // Assert
      expect(mockTransaction.inventoryStock.findMany).toHaveBeenCalledWith({
        where: { skuId: { gt: inputAfterSkuId } },
        orderBy: { skuId: 'asc' },
        take: 500,
      });
    });
  });
  describe('findLedger', () => {
    it('should read the newest entries first, RESTOCK fields included', async () => {
      // Arrange
      mockClient.stockLedger.findMany.mockResolvedValue([
        {
          id: 'l1',
          skuId: SKU_ID,
          actionType: 'RESTOCK',
          quantityChanged: 50,
          orderId: null,
          reservationKey: null,
          referenceNote: 'PO-1',
          createdAt: new Date(5),
        },
      ]);
      // Act
      const actualEntries: StockLedgerEntryReadModel[] =
        await repository.findLedger({ skuId: SKU_ID, limit: 50 });
      // Assert
      expect(actualEntries).toEqual([
        {
          id: 'l1',
          skuId: SKU_ID,
          actionType: 'RESTOCK',
          quantityChanged: 50,
          orderId: null,
          reservationKey: null,
          referenceNote: 'PO-1',
          createdAt: 5,
        },
      ]);
    });
  });
});
