/**
 * `ReserveStockRequest` / `ReleaseStockRequest` of `libs/proto/inventory.proto`, as decoded with
 * `keepCase: false, defaults: true` (camelCase fields, missing scalars set to defaults).
 */
export interface StockOperationRequest {
  readonly idempotencyKey: string;
  readonly orderId: string;
  readonly items: ReadonlyArray<{
    readonly skuId: string;
    readonly quantity: number;
  }>;
}
