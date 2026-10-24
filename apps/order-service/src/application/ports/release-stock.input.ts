/**
 * Input of {@link InventoryRpcPort.releaseStock}; mirrors `ReleaseStockRequest` in `libs/proto/inventory.proto`.
 */
export interface ReleaseStockInput {
  /** Key of the reservation to release (the one used for `reserveStock`). */
  readonly idempotencyKey: string;
  /** Logical order identifier (UUID), recorded in the inventory stock ledger. */
  readonly orderId: string;
  /** SKUs and quantities to return to available stock. */
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
  }>;
}
