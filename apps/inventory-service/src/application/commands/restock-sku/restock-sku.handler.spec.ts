import { DomainError, Result } from '@org/shared-domain';
import { InvalidRestockError } from '../../../domain/errors/invalid-restock.error';
import { RestockRequest } from '../../../domain/value-objects/restock-request.vo';
import { DuplicateRequestError } from '../../errors/duplicate-request.error';
import { StockCounters } from '../../ports/stock-counters.type';
import { StockInboundPort } from '../../ports/stock-inbound.port';
import { StockLevelReadModel } from '../../read-models/stock-level.read-model';
import { RestockSkuCommand } from './restock-sku.command';
import { RestockSkuHandler } from './restock-sku.handler';

const SKU_ID = '0199a7c0-0000-7000-8000-000000000101';
const COUNTERS_AFTER: StockCounters = {
  skuId: SKU_ID,
  totalQuantity: 150,
  reservedQuantity: 4,
};

/**
 * Builds a restock command for 50 units.
 */
const createInputCommand = (): RestockSkuCommand =>
  new RestockSkuCommand({
    skuId: SKU_ID,
    additionalQuantity: 50,
    referenceNote: 'PO-1',
    idempotencyKey: 'receipt-1',
  });

describe('RestockSkuHandler', () => {
  let mockInbound: jest.Mocked<StockInboundPort>;
  let handler: RestockSkuHandler;
  beforeEach(() => {
    mockInbound = {
      saveRestock: jest.fn().mockResolvedValue(Result.ok(COUNTERS_AFTER)),
    };
    handler = new RestockSkuHandler(mockInbound);
  });
  it('should record the receipt (with its outbox event) in one PostgreSQL call and return the durable level', async () => {
    // Arrange
    const expectedStock: StockLevelReadModel = {
      ...COUNTERS_AFTER,
      availableQuantity: 146,
      source: 'DATABASE',
    };
    // Act
    const actualResult: Result<StockLevelReadModel, DomainError> =
      await handler.execute(createInputCommand());
    // Assert
    const actualInput: { restock: RestockRequest; idempotencyKey: string } =
      mockInbound.saveRestock.mock.calls[0][0];
    expect(actualResult.getValue()).toEqual(expectedStock);
    expect(actualInput.restock.quantity).toBe(50);
    expect(actualInput.restock.referenceNote).toBe('PO-1');
    expect(actualInput.idempotencyKey).toBe('receipt-1');
  });
  it('should return the duplicate error for a reused key', async () => {
    // Arrange
    mockInbound.saveRestock.mockResolvedValue(
      Result.fail(new DuplicateRequestError('receipt-1')),
    );
    // Act
    const actualResult: Result<StockLevelReadModel, DomainError> =
      await handler.execute(createInputCommand());
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(DuplicateRequestError);
  });
  it('should reject an invalid receipt before touching PostgreSQL', async () => {
    // Arrange
    const inputCommand: RestockSkuCommand = new RestockSkuCommand({
      skuId: SKU_ID,
      additionalQuantity: 0,
      idempotencyKey: 'k',
    });
    // Act
    const actualResult: Result<StockLevelReadModel, DomainError> =
      await handler.execute(inputCommand);
    // Assert
    expect(actualResult.getError()).toBeInstanceOf(InvalidRestockError);
    expect(mockInbound.saveRestock).not.toHaveBeenCalled();
  });
});
