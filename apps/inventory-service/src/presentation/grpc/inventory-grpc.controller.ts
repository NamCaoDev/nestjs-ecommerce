import { Controller, UseFilters } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { GrpcMethod } from '@nestjs/microservices';
import { DomainError, Result } from '@org/shared-domain';
import { ReleaseStockCommand } from '../../application/commands/release-stock/release-stock.command';
import { ReserveStockCommand } from '../../application/commands/reserve-stock/reserve-stock.command';
import { DomainErrorRpcFilter } from '../../core/filters/domain-error-rpc.filter';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import type { StockOperationRequest } from './stock-operation.request';
import type { StockOperationResponse } from './stock-operation.response';

/** Service name declared in `libs/proto/inventory.proto`. */
const INVENTORY_SERVICE_NAME = 'InventoryService';

/**
 * gRPC endpoints of `inventory.v1.InventoryService`. A stock shortage is a normal answer
 * (`success: false`); malformed requests become `INVALID_ARGUMENT` through {@link DomainErrorRpcFilter}.
 */
@Controller()
@UseFilters(DomainErrorRpcFilter)
export class InventoryGrpcController {
  /**
   * @param commandBus - CQRS command bus.
   */
  public constructor(private readonly commandBus: CommandBus) {}

  /**
   * `rpc ReserveStock (ReserveStockRequest) returns (ReserveStockResponse)`.
   *
   * @param request - Reservation key, order and items.
   * @returns `success: true` when every item is reserved (or the key was already reserved).
   */
  @GrpcMethod(INVENTORY_SERVICE_NAME, 'ReserveStock')
  public async reserveStock(
    request: StockOperationRequest,
  ): Promise<StockOperationResponse> {
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new ReserveStockCommand(InventoryGrpcController.toCommandProps(request)),
    );
    if (result.isSuccess) {
      return { success: true };
    }
    if (result.getError() instanceof InsufficientStockError) {
      return { success: false };
    }
    throw result.getError();
  }

  /**
   * `rpc ReleaseStock (ReleaseStockRequest) returns (ReleaseStockResponse)`.
   *
   * @param request - Reservation key, order and items.
   * @returns `success: true` once the reservation is released or found absent.
   */
  @GrpcMethod(INVENTORY_SERVICE_NAME, 'ReleaseStock')
  public async releaseStock(
    request: StockOperationRequest,
  ): Promise<StockOperationResponse> {
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new ReleaseStockCommand(InventoryGrpcController.toCommandProps(request)),
    );
    if (result.isFailure) {
      throw result.getError();
    }
    return { success: true };
  }

  /**
   * @returns The command data for a gRPC request.
   */
  private static toCommandProps(request: StockOperationRequest): {
    reservationKey: string;
    orderId: string;
    items: StockOperationRequest['items'];
  } {
    return {
      reservationKey: request.idempotencyKey,
      orderId: request.orderId,
      items: request.items,
    };
  }
}
