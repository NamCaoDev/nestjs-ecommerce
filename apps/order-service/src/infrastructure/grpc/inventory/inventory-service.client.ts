import { Observable } from 'rxjs';
import { ReleaseStockInput } from '../../../application/ports/release-stock.input';
import { ReserveStockInput } from '../../../application/ports/reserve-stock.input';

/**
 * Typed view of the `inventory.v1.InventoryService` gRPC stub (fields in camelCase, as loaded with `keepCase: false`).
 */
export interface InventoryServiceClient {
  /** `rpc ReserveStock (ReserveStockRequest) returns (ReserveStockResponse)`. */
  reserveStock(
    request: ReserveStockInput,
  ): Observable<{ readonly success: boolean }>;
  /** `rpc ReleaseStock (ReleaseStockRequest) returns (ReleaseStockResponse)`. */
  releaseStock(
    request: ReleaseStockInput,
  ): Observable<{ readonly success: boolean }>;
}
