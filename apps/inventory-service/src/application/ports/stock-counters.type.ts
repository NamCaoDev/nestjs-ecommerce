/**
 * Raw stock counters of one SKU.
 */
export interface StockCounters {
  readonly skuId: string;
  readonly totalQuantity: number;
  readonly reservedQuantity: number;
}
