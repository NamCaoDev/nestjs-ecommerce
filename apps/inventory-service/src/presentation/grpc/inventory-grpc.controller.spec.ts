import { CommandBus } from '@nestjs/cqrs';
import { Result } from '@org/shared-domain';
import { ReleaseStockCommand } from '../../application/commands/release-stock/release-stock.command';
import { ReserveStockCommand } from '../../application/commands/reserve-stock/reserve-stock.command';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { InvalidReservationError } from '../../domain/errors/invalid-reservation.error';
import { InventoryGrpcController } from './inventory-grpc.controller';
import { StockOperationRequest } from './stock-operation.request';
import { StockOperationResponse } from './stock-operation.response';

const INPUT_REQUEST: StockOperationRequest = {
  idempotencyKey: 'c1:checkout-42',
  orderId: '0199a7c0-0000-7000-8000-000000000001',
  items: [{ skuId: '0199a7c0-0000-7000-8000-000000000101', quantity: 2 }],
};

describe('InventoryGrpcController', () => {
  let mockCommandBus: { readonly execute: jest.Mock };
  let controller: InventoryGrpcController;
  beforeEach(() => {
    mockCommandBus = { execute: jest.fn().mockResolvedValue(Result.ok()) };
    controller = new InventoryGrpcController(
      mockCommandBus as unknown as CommandBus,
    );
  });
  describe('reserveStock', () => {
    it('should dispatch ReserveStockCommand keyed by the idempotency key', async () => {
      // Arrange
      const expectedResponse: StockOperationResponse = { success: true };
      // Act
      const actualResponse: StockOperationResponse =
        await controller.reserveStock(INPUT_REQUEST);
      // Assert
      const actualCommand: ReserveStockCommand =
        mockCommandBus.execute.mock.calls[0][0];
      expect(actualResponse).toEqual(expectedResponse);
      expect(actualCommand).toBeInstanceOf(ReserveStockCommand);
      expect(actualCommand.reservationKey).toBe(INPUT_REQUEST.idempotencyKey);
      expect(actualCommand.orderId).toBe(INPUT_REQUEST.orderId);
      expect(actualCommand.items).toEqual(INPUT_REQUEST.items);
    });
    it('should answer success false when stock is short', async () => {
      // Arrange
      mockCommandBus.execute.mockResolvedValue(
        Result.fail(new InsufficientStockError()),
      );
      // Act
      const actualResponse: StockOperationResponse =
        await controller.reserveStock(INPUT_REQUEST);
      // Assert
      expect(actualResponse).toEqual({ success: false });
    });
    it('should throw other domain errors for the RPC filter', async () => {
      // Arrange
      const expectedError: InvalidReservationError =
        new InvalidReservationError('no items');
      mockCommandBus.execute.mockResolvedValue(Result.fail(expectedError));
      // Act
      const actualCall: Promise<StockOperationResponse> =
        controller.reserveStock(INPUT_REQUEST);
      // Assert
      await expect(actualCall).rejects.toBe(expectedError);
    });
  });
  describe('releaseStock', () => {
    it('should dispatch ReleaseStockCommand and answer success', async () => {
      // Arrange
      const expectedResponse: StockOperationResponse = { success: true };
      // Act
      const actualResponse: StockOperationResponse =
        await controller.releaseStock(INPUT_REQUEST);
      // Assert
      expect(actualResponse).toEqual(expectedResponse);
      expect(mockCommandBus.execute.mock.calls[0][0]).toBeInstanceOf(
        ReleaseStockCommand,
      );
    });
    it('should throw a malformed-request error for the RPC filter', async () => {
      // Arrange
      const expectedError: InvalidReservationError =
        new InvalidReservationError('orderId must be a UUID');
      mockCommandBus.execute.mockResolvedValue(Result.fail(expectedError));
      // Act
      const actualCall: Promise<StockOperationResponse> =
        controller.releaseStock(INPUT_REQUEST);
      // Assert
      await expect(actualCall).rejects.toBe(expectedError);
    });
  });
});
