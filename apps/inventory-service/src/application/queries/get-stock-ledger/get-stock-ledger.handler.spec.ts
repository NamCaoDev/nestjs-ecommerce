import { StockReadPort } from '../../ports/stock-read.port';
import { StockLedgerEntryReadModel } from '../../read-models/stock-ledger-entry.read-model';
import { GetStockLedgerHandler } from './get-stock-ledger.handler';
import { GetStockLedgerQuery } from './get-stock-ledger.query';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';

describe('GetStockLedgerHandler', () => {
  it('should read the 50 most recent entries of the SKU', async () => {
    // Arrange
    const expectedEntries: StockLedgerEntryReadModel[] = [
      {
        id: 'l1',
        skuId: SKU_ID,
        actionType: 'RESERVED',
        quantityChanged: 2,
        orderId: 'o1',
        reservationKey: 'k',
        referenceNote: null,
        createdAt: 1,
      },
    ];
    const mockRead: jest.Mocked<StockReadPort> = {
      findCounters: jest.fn(),
      findLedger: jest.fn().mockResolvedValue(expectedEntries),
      findCountersBySkuIds: jest.fn(),
      findCountersPage: jest.fn(),
    };
    const handler: GetStockLedgerHandler = new GetStockLedgerHandler(mockRead);
    // Act
    const actualEntries: StockLedgerEntryReadModel[] = await handler.execute(
      new GetStockLedgerQuery({ skuId: SKU_ID }),
    );
    // Assert
    expect(actualEntries).toBe(expectedEntries);
    expect(mockRead.findLedger).toHaveBeenCalledWith({
      skuId: SKU_ID,
      limit: 50,
    });
  });
});
