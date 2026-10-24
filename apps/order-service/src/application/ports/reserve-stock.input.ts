/**
 * Input of {@link InventoryRpcPort.reserveStock}; mirrors `ReserveStockRequest` in `libs/proto/inventory.proto`.
 */
export interface ReserveStockInput {
  /** Key making the reservation idempotent on the inventory side. */
  readonly idempotencyKey: string;
  /** Logical order identifier (UUID), recorded in the inventory stock ledger. */
  readonly orderId: string;
  /** SKUs and quantities to reserve, all or nothing. */
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
  }>;
}
