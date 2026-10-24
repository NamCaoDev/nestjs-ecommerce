import { Inject, Injectable } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Result } from '@org/shared-domain';
import { firstValueFrom, timeout } from 'rxjs';
import { StockReservationFailedError } from '../../../application/errors/stock-reservation-failed.error';
import { InventoryRpcPort } from '../../../application/ports/inventory-rpc.port';
import { ReleaseStockInput } from '../../../application/ports/release-stock.input';
import { ReserveStockInput } from '../../../application/ports/reserve-stock.input';
import { INVENTORY_GRPC_CLIENT } from './inventory-grpc-client.token';
import { InventoryServiceClient } from './inventory-service.client';

/** Service name declared in `libs/proto/inventory.proto`. */
const INVENTORY_SERVICE_NAME = 'InventoryService';

/** Upper bound for one inventory call, so a hung service cannot block checkout. */
const RPC_TIMEOUT_MS = 3_000;

/**
 * gRPC implementation of {@link InventoryRpcPort}. Transport errors and timeouts propagate
 * as exceptions; a business refusal is returned as a failed {@link Result}.
 */
@Injectable()
export class InventoryGrpcClientAdapter implements InventoryRpcPort {
  private readonly inventoryService: InventoryServiceClient;

  /**
   * @param client - Nest gRPC client configured for `inventory.v1`.
   */
  public constructor(@Inject(INVENTORY_GRPC_CLIENT) client: ClientGrpc) {
    this.inventoryService = client.getService<InventoryServiceClient>(
      INVENTORY_SERVICE_NAME,
    );
  }

  /**
   * @param input - Idempotency key and items to reserve.
   * @returns Success, or a {@link StockReservationFailedError} when inventory refuses the reservation.
   */
  public async reserveStock(
    input: ReserveStockInput,
  ): Promise<Result<void, StockReservationFailedError>> {
    const response: { readonly success: boolean } = await firstValueFrom(
      this.inventoryService.reserveStock(input).pipe(timeout(RPC_TIMEOUT_MS)),
    );
    if (!response.success) {
      return Result.fail(new StockReservationFailedError());
    }
    return Result.ok();
  }

  /**
   * @param input - Idempotency key of the reservation and the items to release.
   * @throws {Error} When inventory refuses the release, so the caller can log it for reconciliation.
   */
  public async releaseStock(input: ReleaseStockInput): Promise<void> {
    const response: { readonly success: boolean } = await firstValueFrom(
      this.inventoryService.releaseStock(input).pipe(timeout(RPC_TIMEOUT_MS)),
    );
    if (!response.success) {
      throw new Error(
        `Inventory refused to release stock for Idempotency-Key ${input.idempotencyKey}.`,
      );
    }
  }
}
