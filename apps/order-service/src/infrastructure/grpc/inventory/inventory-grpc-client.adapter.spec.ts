import type { ClientGrpc } from '@nestjs/microservices';
import { Result } from '@org/shared-domain';
import { NEVER, of } from 'rxjs';
import { StockReservationFailedError } from '../../../application/errors/stock-reservation-failed.error';
import { ReserveStockInput } from '../../../application/ports/reserve-stock.input';
import { InventoryGrpcClientAdapter } from './inventory-grpc-client.adapter';
import { InventoryServiceClient } from './inventory-service.client';

const INPUT_STOCK: ReserveStockInput = {
  idempotencyKey: 'checkout-42',
  orderId: '0199a7c0-0000-7000-8000-000000000001',
  items: [{ skuId: '0199a7c0-0000-7000-8000-0000000000a1', quantity: 2 }],
};

describe('InventoryGrpcClientAdapter', () => {
  let mockInventoryService: jest.Mocked<InventoryServiceClient>;
  let mockClient: { readonly getService: jest.Mock };
  let adapter: InventoryGrpcClientAdapter;
  beforeEach(() => {
    mockInventoryService = {
      reserveStock: jest.fn().mockReturnValue(of({ success: true })),
      releaseStock: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockClient = {
      getService: jest.fn().mockReturnValue(mockInventoryService),
    };
    adapter = new InventoryGrpcClientAdapter(
      mockClient as unknown as ClientGrpc,
    );
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  it('should resolve the InventoryService stub', () => {
    // Arrange
    const expectedServiceName: string = 'InventoryService';
    // Act
    const actualCalls: unknown[][] = mockClient.getService.mock.calls;
    // Assert
    expect(actualCalls).toEqual([[expectedServiceName]]);
  });
  describe('reserveStock', () => {
    it('should succeed when inventory reserves every item', async () => {
      // Arrange
      const inputStock: ReserveStockInput = INPUT_STOCK;
      // Act
      const actualResult: Result<void, StockReservationFailedError> =
        await adapter.reserveStock(inputStock);
      // Assert
      expect(actualResult.isSuccess).toBe(true);
      expect(mockInventoryService.reserveStock).toHaveBeenCalledWith(
        inputStock,
      );
    });
    it('should fail with StockReservationFailedError when inventory refuses', async () => {
      // Arrange
      mockInventoryService.reserveStock.mockReturnValue(of({ success: false }));
      // Act
      const actualResult: Result<void, StockReservationFailedError> =
        await adapter.reserveStock(INPUT_STOCK);
      // Assert
      expect(actualResult.getError()).toBeInstanceOf(
        StockReservationFailedError,
      );
    });
    it('should throw when inventory does not answer in time', async () => {
      // Arrange
      jest.useFakeTimers();
      mockInventoryService.reserveStock.mockReturnValue(NEVER);
      // Act
      const actualCall: Promise<Result<void, StockReservationFailedError>> =
        adapter.reserveStock(INPUT_STOCK);
      jest.advanceTimersByTime(3_000);
      // Assert
      await expect(actualCall).rejects.toThrow('Timeout');
    });
  });
  describe('releaseStock', () => {
    it('should resolve when inventory releases the reservation', async () => {
      // Arrange
      const inputStock: ReserveStockInput = INPUT_STOCK;
      // Act
      const actualCall: Promise<void> = adapter.releaseStock(inputStock);
      // Assert
      await expect(actualCall).resolves.toBeUndefined();
      expect(mockInventoryService.releaseStock).toHaveBeenCalledWith(
        inputStock,
      );
    });
    it('should throw when inventory refuses the release', async () => {
      // Arrange
      mockInventoryService.releaseStock.mockReturnValue(of({ success: false }));
      // Act
      const actualCall: Promise<void> = adapter.releaseStock(INPUT_STOCK);
      // Assert
      await expect(actualCall).rejects.toThrow('checkout-42');
    });
  });
});
