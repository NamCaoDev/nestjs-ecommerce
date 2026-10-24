import { Result } from '@org/shared-domain';
import { StockReservationFailedError } from '../errors/stock-reservation-failed.error';
import { ReleaseStockInput } from './release-stock.input';
import { ReserveStockInput } from './reserve-stock.input';

/**
 * Outbound port to the inventory service (gRPC `inventory.v1.InventoryService`).
 * Injected with {@link INVENTORY_RPC_PORT}.
 */
export interface InventoryRpcPort {
  /**
   * Atomically reserves stock for every item.
   *
   * @param input - Idempotency key and items to reserve.
   * @returns Success, or a {@link StockReservationFailedError} when any item cannot be reserved.
   */
  reserveStock(
    input: ReserveStockInput,
  ): Promise<Result<void, StockReservationFailedError>>;

  /**
   * Compensates a reservation. Idempotent: releasing an unknown or already released reservation is a no-op.
   *
   * @param input - Idempotency key of the reservation and the items to release.
   * @throws When the inventory service cannot be reached or refuses the release.
   */
  releaseStock(input: ReleaseStockInput): Promise<void>;
}
