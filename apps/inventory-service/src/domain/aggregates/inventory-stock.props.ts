/**
 * State of an {@link InventoryStock}.
 */
export interface InventoryStockProps {
  /** Logical SKU identifier (UUID). */
  readonly skuId: string;
  /** Units physically held. */
  readonly totalQuantity: number;
  /** Units held for pending orders. */
  readonly reservedQuantity: number;
  /** Optimistic concurrency version. */
  readonly version: number;
}
