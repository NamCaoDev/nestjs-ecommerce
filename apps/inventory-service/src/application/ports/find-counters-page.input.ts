/**
 * Input of {@link StockReadPort.findCountersPage} (keyset pagination by SKU id).
 */
export interface FindCountersPageInput {
  /** Last SKU id of the previous page; omit for the first page. */
  readonly afterSkuId?: string;
  readonly limit: number;
}
