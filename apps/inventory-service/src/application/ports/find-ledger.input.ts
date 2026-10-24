/**
 * Input of {@link StockReadPort.findLedger}.
 */
export interface FindLedgerInput {
  readonly skuId: string;
  /** Maximum number of entries, newest first. */
  readonly limit: number;
}
