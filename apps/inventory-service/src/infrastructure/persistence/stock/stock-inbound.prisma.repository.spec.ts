import { Result } from '@org/shared-domain';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { DuplicateRequestError } from '../../../application/errors/duplicate-request.error';
import { StockCounters } from '../../../application/ports/stock-counters.type';
import { RestockRequest } from '../../../domain/value-objects/restock-request.vo';
import { PrismaService } from '../prisma/prisma.service';
import { StockInboundPrismaRepository } from './stock-inbound.prisma.repository';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';
const INPUT_RESTOCK: RestockRequest = RestockRequest.create({
  skuId: SKU_ID,
  quantity: 50,
  referenceNote: 'PO-1',
}).getValue();

describe('StockInboundPrismaRepository', () => {
  let mockTransaction: {
    readonly inventoryStock: { readonly upsert: jest.Mock };
    readonly stockLedger: { readonly create: jest.Mock };
    readonly outboxEvent: { readonly create: jest.Mock };
  };
  let repository: StockInboundPrismaRepository;
  beforeEach(() => {
    mockTransaction = {
      inventoryStock: {
        upsert: jest.fn().mockResolvedValue({
          skuId: SKU_ID,
          totalQuantity: 150,
          reservedQuantity: 4,
        }),
      },
      stockLedger: { create: jest.fn().mockResolvedValue({}) },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const mockClient: { readonly $transaction: jest.Mock } = {
      $transaction: jest.fn(
        (work: (transaction: typeof mockTransaction) => Promise<unknown>) =>
          work(mockTransaction),
      ),
    };
    repository = new StockInboundPrismaRepository({
      client: mockClient,
    } as unknown as PrismaService);
  });
  it('should upsert the stock, append a RESTOCK entry and write the stock.restocked outbox event in one transaction', async () => {
    // Arrange
    const expectedCounters: StockCounters = {
      skuId: SKU_ID,
      totalQuantity: 150,
      reservedQuantity: 4,
    };
    // Act
    const actualResult: Result<StockCounters, DuplicateRequestError> =
      await repository.saveRestock({
        restock: INPUT_RESTOCK,
        idempotencyKey: 'receipt-1',
      });
    // Assert
    expect(actualResult.getValue()).toEqual(expectedCounters);
    expect(mockTransaction.inventoryStock.upsert).toHaveBeenCalledWith({
      where: { skuId: SKU_ID },
      create: { skuId: SKU_ID, totalQuantity: 50, reservedQuantity: 0 },
      update: { totalQuantity: { increment: 50 }, version: { increment: 1 } },
    });
    expect(mockTransaction.stockLedger.create).toHaveBeenCalledWith({
      data: {
        skuId: SKU_ID,
        quantityChanged: 50,
        actionType: 'RESTOCK',
        referenceNote: 'PO-1',
        idempotencyKey: 'receipt-1',
      },
    });
    expect(mockTransaction.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        aggregateType: 'InventoryStock',
        aggregateId: SKU_ID,
        eventType: 'stock.restocked',
        payload: { skuId: SKU_ID, additionalQuantity: 50 },
      },
    });
  });
  it('should map a reused Idempotency-Key to DuplicateRequestError', async () => {
    // Arrange
    mockTransaction.stockLedger.create.mockRejectedValue(
      new PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7.10.1',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: 'stock_ledger_idempotency_key_key' },
            },
          },
        },
      }),
    );
    // Act
    const actualResult: Result<StockCounters, DuplicateRequestError> =
      await repository.saveRestock({
        restock: INPUT_RESTOCK,
        idempotencyKey: 'receipt-1',
      });
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(DuplicateRequestError);
  });
  it('should rethrow other database errors', async () => {
    // Arrange
    const expectedError: Error = new Error('connection reset');
    mockTransaction.inventoryStock.upsert.mockRejectedValue(expectedError);
    // Act
    const actualCall: Promise<Result<StockCounters, DuplicateRequestError>> =
      repository.saveRestock({
        restock: INPUT_RESTOCK,
        idempotencyKey: 'receipt-1',
      });
    // Assert
    await expect(actualCall).rejects.toBe(expectedError);
  });
});
